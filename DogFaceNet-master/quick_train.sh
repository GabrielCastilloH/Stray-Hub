#!/bin/bash
# Quick Training Setup Script for Hackathon

set -e

echo "🐕 DogFaceNet Quick Training Setup"
echo "=================================="

# Check if dataset exists
if [ ! -d "data/dogfacenet/aligned/after_4_bis" ]; then
    echo ""
    echo "⚠️  Dataset not found!"
    echo ""
    echo "Please download and extract the dataset:"
    echo "1. Download: https://github.com/GuillaumeMougeot/DogFaceNet/releases/download/v1.0/DogFaceNet_Dataset_224_1.zip"
    echo "2. Extract it"
    echo "3. Move the 'after_4_bis' folder to: data/dogfacenet/aligned/"
    echo ""
    echo "Expected structure:"
    echo "  data/dogfacenet/aligned/after_4_bis/"
    echo "    ├── dog_001/"
    echo "    ├── dog_002/"
    echo "    └── ..."
    echo ""
    read -p "Press Enter once dataset is ready, or Ctrl+C to cancel..."
fi

# Check dataset
DOG_COUNT=$(ls -d data/dogfacenet/aligned/after_4_bis/*/ 2>/dev/null | wc -l)
if [ "$DOG_COUNT" -lt 100 ]; then
    echo "❌ Dataset seems incomplete. Found only $DOG_COUNT dog folders."
    echo "Expected: 1393 folders"
    exit 1
fi

echo "✓ Found $DOG_COUNT dog folders"

# Create output directories
mkdir -p output/model
mkdir -p output/history

echo "✓ Output directories created"

# Check Python and dependencies
echo ""
echo "Checking Python environment..."

if ! python3 -c "import tensorflow" 2>/dev/null; then
    echo "⚠️  TensorFlow not found. Installing..."
    pip install tensorflow==1.12.0 numpy matplotlib scikit-image tqdm
fi

echo "✓ Dependencies ready"

# Modify training script for quick training
echo ""
echo "⚙️  Configuring for quick training (50 epochs)..."

# Create a modified version for quick training
cat > dogfacenet/dogfacenet_quick.py << 'PYTHON_EOF'
# Quick training version for hackathon
# Modified from original dogfacenet.py

import sys
sys.path.insert(0, '.')

# Import original with modified config
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# Set quick training parameters
QUICK_EPOCHS = 50
QUICK_STEPS = 100
QUICK_VAL_STEPS = 20

# Load and run original training
exec(open('dogfacenet/dogfacenet.py').read().replace(
    'NBOF_EPOCHS = 250',
    f'NBOF_EPOCHS = {QUICK_EPOCHS}'
).replace(
    'STEPS_PER_EPOCH = 300',
    f'STEPS_PER_EPOCH = {QUICK_STEPS}'
).replace(
    'VALIDATION_STEPS = 30',
    f'VALIDATION_STEPS = {QUICK_VAL_STEPS}'
))
PYTHON_EOF

echo "✓ Quick training script created"

echo ""
echo "=========================================="
echo "🚀 Ready to train!"
echo "=========================================="
echo ""
echo "Training will take approximately 2-3 hours on GPU"
echo ""
echo "To start training:"
echo "  cd dogfacenet"
echo "  python dogfacenet.py"
echo ""
echo "Or for quick training (50 epochs):"
echo "  python ../dogfacenet_quick.py"
echo ""
echo "Monitor progress by watching the loss decrease."
echo "Training is complete when you see: 'Done saving model'"
echo ""
echo "After training, copy weights:"
echo "  cp output/model/*.h5 ../ml/checkpoints/dogfacenet_weights.h5"
echo ""
