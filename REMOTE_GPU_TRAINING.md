# Training DogFaceNet on Remote GPU (JupyterHub)

Complete guide for training on JupyterHub and migrating weights back to your local project.

## 📋 Overview

**What you'll do:**
1. Upload dataset + training files to JupyterHub
2. Run training on GPU (~2-3 hours)
3. Download trained weights
4. Use weights in your local project

**Time:** 2-3 hours for training, 10 minutes for setup/download

---

## 🚀 Step-by-Step Instructions

### Step 1: Prepare Files Locally (5 minutes)

**A. Download the dataset:**
1. Go to: https://github.com/GuillaumeMougeot/DogFaceNet/releases/tag/v1.0
2. Click `DogFaceNet_Dataset_224_1.zip` (72.1 MB)
3. Save to your Downloads folder

**B. Create training script:**

I've created `train_dogfacenet_gpu.ipynb` in the `DogFaceNet-master/` folder.

You need TWO files to upload:
- `DogFaceNet_Dataset_224_1.zip` (the dataset)
- `train_dogfacenet_gpu.ipynb` (the training notebook)

---

### Step 2: Upload to JupyterHub (5 minutes)

**A. Log into your JupyterHub:**
```
https://your-jupyter-hub-url.com
```

**B. Upload files:**
1. Click the **"Upload"** button (top right)
2. Select `DogFaceNet_Dataset_224_1.zip` from Downloads
3. Click **"Upload"** again
4. Select `train_dogfacenet_gpu.ipynb`
5. Wait for both uploads to complete

**C. Verify uploads:**
You should see both files in your JupyterHub file browser.

---

### Step 3: Open and Run Training Notebook (2-3 hours)

**A. Open the notebook:**
- Click on `train_dogfacenet_gpu.ipynb`

**B. Run cells in order:**

**Cell 1: Install Dependencies**
```python
!pip install tensorflow numpy scikit-image matplotlib tqdm

import tensorflow as tf
print(f"TensorFlow: {tf.__version__}")
print(f"GPUs: {tf.config.list_physical_devices('GPU')}")
```

**Cell 2: Extract Dataset**
```python
!unzip -q DogFaceNet_Dataset_224_1.zip
!mkdir -p data/dogfacenet/aligned
!mv after_4_bis data/dogfacenet/aligned/

import os
dogs = os.listdir('data/dogfacenet/aligned/after_4_bis')
print(f"✓ Found {len(dogs)} dog folders")
```

**Cell 3: Load Dataset**
```python
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
            filenames.append(os.path.join(root, f))
            labels.append(idx)
        idx += 1

filenames = np.array(filenames)
labels = np.array(labels)

print(f'✓ Images: {len(labels)}')
print(f'✓ Dogs: {len(np.unique(labels))}')
```

**Cell 4: Train/Test Split**
```python
nbof_classes = len(np.unique(labels))
nbof_test = int(0.1 * nbof_classes)

keep_test = labels < nbof_test
keep_train = ~keep_test

filenames_test = filenames[keep_test]
labels_test = labels[keep_test]
filenames_train = filenames[keep_train]
labels_train = labels[keep_train]

print(f"✓ Train: {len(filenames_train)} images")
print(f"✓ Test: {len(filenames_test)} images")
```

**Cell 5: Define Model**
```python
from tensorflow.keras import Model
from tensorflow.keras.layers import *
import tensorflow.keras.backend as K

# Triplet loss
alpha = 0.3
def triplet(y_true, y_pred):
    a = y_pred[0::3]
    p = y_pred[1::3]
    n = y_pred[2::3]
    ap = K.sum(K.square(a - p), -1)
    an = K.sum(K.square(a - n), -1)
    return K.sum(tf.nn.relu(ap - an + alpha))

def triplet_acc(y_true, y_pred):
    a = y_pred[0::3]
    p = y_pred[1::3]
    n = y_pred[2::3]
    ap = K.sum(K.square(a - p), -1)
    an = K.sum(K.square(a - n), -1)
    return K.less(ap + alpha, an)

# Build model
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

print(f"✓ Model: {model.count_params():,} parameters")
```

**Cell 6: Data Generators (Simplified)**
```python
def load_images(filenames):
    h, w, c = SIZE
    images = np.empty((len(filenames), h, w, c))
    for i, f in enumerate(filenames):
        images[i] = sk.io.imread(f) / 255.0
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

print("✓ Generators ready")
```

**Cell 7: Train! (This takes 2-3 hours)**
```python
EPOCHS = 50  # Quick training
STEPS = 100
VAL_STEPS = 20
BATCH = 30

print("🚀 Training started...")
print(f"   Epochs: {EPOCHS}")
print(f"   Est. time: 2-3 hours")

history = model.fit(
    image_generator(filenames_train, labels_train, BATCH),
    steps_per_epoch=STEPS,
    epochs=EPOCHS,
    validation_data=image_generator(filenames_test, labels_test, BATCH),
    validation_steps=VAL_STEPS,
    verbose=1
)

print("\n✓ Training complete!")
```

**Cell 8: Save Model**
```python
model.save('dogfacenet_weights.h5')

print("✓ Saved: dogfacenet_weights.h5")
print(f"\nFinal train acc: {history.history['triplet_acc'][-1]:.2%}")
print(f"Final val acc: {history.history['val_triplet_acc'][-1]:.2%}")
```

---

### Step 4: Download Trained Weights (2 minutes)

**A. In JupyterHub:**
1. Right-click on `dogfacenet_weights.h5` in the file browser
2. Click **"Download"**
3. Save to your Downloads folder

**File size:** Should be ~5-10 MB

---

### Step 5: Move Weights to Your Project (1 minute)

**Option 1: Drag & Drop**
1. Open Finder
2. Go to Downloads folder
3. Find `dogfacenet_weights.h5`
4. Drag it to: `Desktop/GaboShrub/Stray-Hub/ml/checkpoints/`

**Option 2: Terminal**
```bash
mv ~/Downloads/dogfacenet_weights.h5 ~/Desktop/GaboShrub/Stray-Hub/ml/checkpoints/
```

---

### Step 6: Test Locally (1 minute)

```bash
cd ~/Desktop/GaboShrub/Stray-Hub/ml

# Test loading
python -c "
from services.dogfacenet import DogFaceNetEmbedder
embedder = DogFaceNetEmbedder.load('checkpoints/dogfacenet_weights.h5')
print('✓ Weights loaded successfully!')
print(embedder.get_model_info())
"
```

**Expected output:**
```
✓ Loaded full model from: checkpoints/dogfacenet_weights.h5
✓ Model ready: input (224, 224, 3), output 32D
✓ Model version: v1.0
✓ Weights loaded successfully!
{
  'version': 'v1.0',
  'embedding_size': 32,
  'input_shape': (224, 224, 3),
  'weights_path': 'checkpoints/dogfacenet_weights.h5',
  'total_parameters': 1234567
}
```

---

## ✅ You're Done!

Now you can use the trained model in your backend:

```python
from ml.embed import get_embedder

# Load trained model
embedder = get_embedder('ml/checkpoints/dogfacenet_weights.h5')

# Generate real embeddings!
embedding = embedder.embed('dog_image.jpg')
```

---

## 🐛 Troubleshooting

### Training is slow
**Check if GPU is being used:**
```python
import tensorflow as tf
print(tf.config.list_physical_devices('GPU'))
```
Should show at least 1 GPU.

### Out of memory
**Reduce batch size** in Cell 7:
```python
BATCH = 15  # Instead of 30
```

### Training loss not decreasing
- Check that dataset extracted correctly
- Verify ~8,000+ images loaded
- Let it run for at least 10 epochs

### Can't download weights file
**Alternative**: Use `scp` to copy from JupyterHub:
```bash
scp user@jupyter-server:~/dogfacenet_weights.h5 ~/Desktop/GaboShrub/Stray-Hub/ml/checkpoints/
```

---

## 📊 Expected Results

After 50 epochs (2-3 hours):
- **Train accuracy**: 75-85%
- **Validation accuracy**: 70-80%
- **File size**: ~5-10 MB
- **Good enough for hackathon demo!** ✅

Full training (250 epochs = 10-15 hours) would give ~92% accuracy, but 50 epochs is plenty for your MVP.

---

## ⏱️ Timeline Summary

| Step | Time | Activity |
|------|------|----------|
| 1 | 2 min | Download dataset locally |
| 2 | 3 min | Upload to JupyterHub |
| 3 | 2-3 hrs | Training (run in background!) |
| 4 | 2 min | Download weights |
| 5 | 1 min | Move to project |
| 6 | 1 min | Test locally |
| **Total** | **~3 hours** | **Most is GPU training** |

**Pro tip**: Start training NOW, then build your app while it runs! 🚀
