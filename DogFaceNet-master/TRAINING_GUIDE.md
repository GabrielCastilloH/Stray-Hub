# Quick Training Guide for Hackathon

## Step 1: Download Dataset

1. Download: https://github.com/GuillaumeMougeot/DogFaceNet/releases/download/v1.0/DogFaceNet_Dataset_224_1.zip
2. Extract the zip file
3. Move the extracted folder to: `DogFaceNet-master/data/dogfacenet/aligned/`

The structure should be:
```
DogFaceNet-master/data/dogfacenet/aligned/after_4_bis/
├── dog_001/
│   ├── image1.jpg
│   ├── image2.jpg
├── dog_002/
│   ├── image1.jpg
│   ├── image2.jpg
└── ... (1393 dog folders)
```

## Step 2: Install Training Dependencies

```bash
cd DogFaceNet-master
pip install tensorflow==1.12.0 numpy scikit-image matplotlib tqdm
```

**IMPORTANT**: Training uses TensorFlow 1.12 (old version). Use a separate environment!

## Step 3: Edit Training Script

Edit `dogfacenet/dogfacenet.py`:

```python
# Line 29-31: Update paths
PATH = './data/dogfacenet/aligned/after_4_bis/'  # Dataset path
PATH_SAVE = './output/history/'
PATH_MODEL = './output/model/'

# Line 38: Reduce epochs for quick training
NBOF_EPOCHS = 50  # Original: 250. For hackathon: 50 is enough

# Line 40-41: Adjust batch settings
STEPS_PER_EPOCH = 100  # Original: 300. Faster training
VALIDATION_STEPS = 20  # Original: 30
```

## Step 4: Train on GPU

### Local GPU:
```bash
cd dogfacenet
python dogfacenet.py
```

### Remote GPU (via SSH):
```bash
# On your machine:
scp -r DogFaceNet-master/ user@gpu-server:~/

# SSH to GPU server:
ssh user@gpu-server
cd DogFaceNet-master/dogfacenet
python dogfacenet.py
```

## Step 5: Training Time Estimates

With GPU:
- 50 epochs: ~2-3 hours
- 100 epochs: ~4-6 hours
- 250 epochs (full): ~10-15 hours

For hackathon: **50 epochs is enough** for good results!

## Step 6: Monitor Training

Watch for output like:
```
Epoch: 0/50, step: 1/100, loss: 0.6, acc: 0.2
Epoch: 0/50, step: 2/100, loss: 0.5, acc: 0.3
...
Epoch: 49/50, step: 100/100, loss: 0.1, acc: 0.85
```

Training is working if:
- Loss decreases over time
- Accuracy increases over time

## Step 7: Copy Trained Weights

After training completes:

```bash
# Find the latest checkpoint
ls -lh output/model/

# Copy to your ml/checkpoints directory
cp output/model/2019.07.29.dogfacenet.49.h5 ../ml/checkpoints/dogfacenet_weights.h5
```

## Step 8: Test the Weights

```bash
cd ../ml
python -c "
from services.dogfacenet import DogFaceNetEmbedder
embedder = DogFaceNetEmbedder.load('checkpoints/dogfacenet_weights.h5')
print('✓ Weights loaded successfully!')
"
```

## Quick Hackathon Strategy

**Option A: Full Training (if you have 4+ hours)**
- Start training NOW
- Train for 50-100 epochs
- Use weights for final demo

**Option B: Partial Training (if you have 2 hours)**
- Train for 20-30 epochs
- Weights won't be perfect but better than random
- Good enough for demo!

**Option C: No Training (if no time)**
- Use without weights
- Build the full pipeline
- Show concept demo

## Troubleshooting

### "No module named 'tensorflow'"
```bash
pip install tensorflow==1.12.0
```

### "No data provided" error
Check that dataset is in: `data/dogfacenet/aligned/after_4_bis/`

### CUDA out of memory
Reduce batch size in line 184 of dogfacenet.py:
```python
batch_size = 3*5  # Original: 3*10
```

### Training too slow
- Reduce STEPS_PER_EPOCH to 50
- Reduce NBOF_EPOCHS to 30
- Use smaller nbof_subclasses (line 185)

## Expected Results

After 50 epochs, you should see:
- Training accuracy: ~75-85%
- Validation accuracy: ~70-80%
- This is GOOD ENOUGH for hackathon demo!

Full training (250 epochs) gets ~92% accuracy but takes 10-15 hours.
