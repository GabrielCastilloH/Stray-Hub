"""
DogFaceNet Quick Training Script for Remote GPU
Upload this + DogFaceNet_Dataset_224_1.zip to JupyterHub
Then run: python train_quick.py
"""

print("="*60)
print("DogFaceNet Quick Training for Hackathon")
print("="*60)

# ============================================================================
# Step 1: Setup and Extract Dataset
# ============================================================================
print("\n[1/7] Setting up environment...")

import os
import subprocess

# Extract dataset if zip exists
if os.path.exists('DogFaceNet_Dataset_224_1.zip'):
    print("  Extracting dataset...")
    subprocess.run(['unzip', '-q', 'DogFaceNet_Dataset_224_1.zip'])
    os.makedirs('data/dogfacenet/aligned', exist_ok=True)
    subprocess.run(['mv', 'after_4_bis', 'data/dogfacenet/aligned/'])
    print("  ✓ Dataset extracted")
else:
    print("  ⚠ Upload DogFaceNet_Dataset_224_1.zip first!")
    exit(1)

# ============================================================================
# Step 2: Check GPU
# ============================================================================
print("\n[2/7] Checking GPU...")

import tensorflow as tf
gpus = tf.config.list_physical_devices('GPU')
print(f"  TensorFlow: {tf.__version__}")
print(f"  GPUs found: {len(gpus)}")
if len(gpus) > 0:
    print(f"  ✓ GPU training enabled: {gpus[0].name}")
else:
    print("  ⚠ No GPU found - training will be slow!")

# ============================================================================
# Step 3: Load Dataset
# ============================================================================
print("\n[3/7] Loading dataset...")

import numpy as np
import skimage as sk

PATH = 'data/dogfacenet/aligned/after_4_bis/'
SIZE = (224, 224, 3)

filenames = []
labels = []
idx = 0

for root, dirs, files in os.walk(PATH):
    if len(files) > 1:
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                filenames.append(os.path.join(root, f))
                labels.append(idx)
        idx += 1

filenames = np.array(filenames)
labels = np.array(labels)

print(f"  ✓ Loaded {len(labels)} images")
print(f"  ✓ Found {len(np.unique(labels))} dogs")

# Split train/test
nbof_classes = len(np.unique(labels))
nbof_test = int(0.1 * nbof_classes)
keep_test = labels < nbof_test
keep_train = ~keep_test

filenames_test = filenames[keep_test]
labels_test = labels[keep_test]
filenames_train = filenames[keep_train]
labels_train = labels[keep_train]

print(f"  ✓ Train: {len(filenames_train)} images, {nbof_classes - nbof_test} dogs")
print(f"  ✓ Test: {len(filenames_test)} images, {nbof_test} dogs")

# ============================================================================
# Step 4: Build Model
# ============================================================================
print("\n[4/7] Building model...")

from tensorflow.keras import Model
from tensorflow.keras.layers import *
import tensorflow.keras.backend as K

# Triplet loss
alpha = 0.3
def triplet(y_true, y_pred):
    a, p, n = y_pred[0::3], y_pred[1::3], y_pred[2::3]
    ap = K.sum(K.square(a - p), -1)
    an = K.sum(K.square(a - n), -1)
    return K.sum(tf.nn.relu(ap - an + alpha))

def triplet_acc(y_true, y_pred):
    a, p, n = y_pred[0::3], y_pred[1::3], y_pred[2::3]
    ap = K.sum(K.square(a - p), -1)
    an = K.sum(K.square(a - n), -1)
    return K.less(ap + alpha, an)

# Build DogFaceNet architecture
emb_size = 32
inputs = Input(shape=SIZE)

x = Conv2D(16, (7, 7), (2, 2), use_bias=False, activation='relu', padding='same')(inputs)
x = BatchNormalization()(x)
x = MaxPooling2D((3, 3))(x)

for layer in [16, 32, 64, 128, 512]:
    x = Conv2D(layer, (3, 3), strides=(2, 2), use_bias=False, activation='relu', padding='same')(x)
    r = BatchNormalization()(x)
    x = Conv2D(layer, (3, 3), use_bias=False, activation='relu', padding='same')(r)
    x = BatchNormalization()(x)
    r = Add()([r, x])
    x = Conv2D(layer, (3, 3), use_bias=False, activation='relu', padding='same')(r)
    x = BatchNormalization()(x)
    x = Add()([r, x])

x = GlobalAveragePooling2D()(x)
x = Flatten()(x)
x = Dropout(0.5)(x)
x = Dense(emb_size, use_bias=False)(x)
outputs = Lambda(lambda x: tf.nn.l2_normalize(x, axis=-1))(x)

model = Model(inputs, outputs)
model.compile(loss=triplet, optimizer='adam', metrics=[triplet_acc])

print(f"  ✓ Model built: {model.count_params():,} parameters")

# ============================================================================
# Step 5: Data Generators
# ============================================================================
print("\n[5/7] Preparing data generators...")

def load_images(filenames):
    h, w, c = SIZE
    images = np.empty((len(filenames), h, w, c))
    for i, f in enumerate(filenames):
        try:
            images[i] = sk.io.imread(f) / 255.0
        except:
            images[i] = np.zeros((h, w, c))
    return images

def define_triplets(filenames, labels, batch_size=30):
    triplet_fns = []
    y_triplet = np.empty(batch_size)
    classes = np.unique(labels)
    
    for i in range(0, batch_size, 3):
        # Anchor + Positive (same dog)
        classAP = classes[np.random.randint(len(classes))]
        keep = labels == classAP
        keep_fns = filenames[keep]
        
        if len(keep_fns) < 2:
            continue
            
        idx1, idx2 = np.random.choice(len(keep_fns), 2, replace=False)
        triplet_fns.extend([keep_fns[idx1], keep_fns[idx2]])
        y_triplet[i:i+2] = classAP
        
        # Negative (different dog)
        classN = classes[np.random.randint(len(classes))]
        while classN == classAP:
            classN = classes[np.random.randint(len(classes))]
        keep = labels == classN
        keep_fns = filenames[keep]
        idx3 = np.random.randint(len(keep_fns))
        triplet_fns.append(keep_fns[idx3])
        y_triplet[i+2] = classN
    
    return triplet_fns, y_triplet

def image_generator(filenames, labels, batch_size=30):
    while True:
        f_triplet, y_triplet = define_triplets(filenames, labels, batch_size)
        i_triplet = load_images(f_triplet)
        yield (i_triplet, y_triplet)

print("  ✓ Generators ready")

# ============================================================================
# Step 6: Train Model
# ============================================================================
print("\n[6/7] Training model...")
print("  This will take 2-3 hours on GPU")
print("  Watch for decreasing loss and increasing accuracy")
print("")

EPOCHS = 50
STEPS = 100
VAL_STEPS = 20
BATCH = 30

history = model.fit(
    image_generator(filenames_train, labels_train, BATCH),
    steps_per_epoch=STEPS,
    epochs=EPOCHS,
    validation_data=image_generator(filenames_test, labels_test, BATCH),
    validation_steps=VAL_STEPS,
    verbose=1
)

print("\n  ✓ Training complete!")

# ============================================================================
# Step 7: Save Model
# ============================================================================
print("\n[7/7] Saving model...")

model.save('dogfacenet_weights.h5')

final_train_acc = history.history['triplet_acc'][-1]
final_val_acc = history.history['val_triplet_acc'][-1]

print(f"  ✓ Saved: dogfacenet_weights.h5")
print("")
print("="*60)
print("TRAINING COMPLETE!")
print("="*60)
print(f"Final training accuracy:   {final_train_acc:.2%}")
print(f"Final validation accuracy: {final_val_acc:.2%}")
print("")
print("📥 Next steps:")
print("  1. Download 'dogfacenet_weights.h5' from JupyterHub")
print("  2. Move to: ml/checkpoints/dogfacenet_weights.h5")
print("  3. Test with: python ml/embed.py")
print("="*60)
