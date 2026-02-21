"""
DogFaceNet Model Architecture

A modified ResNet architecture for dog face embedding generation.
This is inference-only code extracted from the original DogFaceNet repository.

Licensed under the MIT License
Original implementation by Guillaume Mougeot
"""

import tensorflow as tf
from tensorflow.keras import Model
from tensorflow.keras.layers import (
    Input, Conv2D, MaxPooling2D, Add, 
    GlobalAveragePooling2D, Activation, 
    Dropout, Flatten, Dense, Lambda, 
    BatchNormalization
)


def build_dogfacenet_model(input_shape=(224, 224, 3), emb_size=32):
    """
    Build the DogFaceNet model architecture.
    
    This is a modified ResNet with Dropout layers and without bottleneck layers.
    The model outputs L2-normalized embeddings suitable for metric learning.
    
    Args:
        input_shape: Tuple of (height, width, channels). Default (224, 224, 3)
        emb_size: Size of the embedding vector. Default 32
        
    Returns:
        tf.keras.Model: The DogFaceNet model
    """
    inputs = Input(shape=input_shape, name='input_image')

    # Initial convolution block
    x = Conv2D(16, (7, 7), strides=(2, 2), use_bias=False, 
               activation='relu', padding='same', name='conv_initial')(inputs)
    x = BatchNormalization(name='bn_initial')(x)
    x = MaxPooling2D((3, 3), name='maxpool_initial')(x)

    # Residual blocks with progressively increasing channels
    layer_configs = [16, 32, 64, 128, 512]
    
    for block_idx, n_filters in enumerate(layer_configs):
        # Downsampling convolution
        x = Conv2D(n_filters, (3, 3), strides=(2, 2), use_bias=False, 
                   activation='relu', padding='same', 
                   name=f'conv_block{block_idx}_downsample')(x)
        residual = BatchNormalization(name=f'bn_block{block_idx}_0')(x)
        
        # First residual sub-block
        x = Conv2D(n_filters, (3, 3), use_bias=False, activation='relu', 
                   padding='same', name=f'conv_block{block_idx}_1a')(residual)
        x = BatchNormalization(name=f'bn_block{block_idx}_1')(x)
        residual = Add(name=f'add_block{block_idx}_1')([residual, x])
        
        # Second residual sub-block
        x = Conv2D(n_filters, (3, 3), use_bias=False, activation='relu', 
                   padding='same', name=f'conv_block{block_idx}_2a')(residual)
        x = BatchNormalization(name=f'bn_block{block_idx}_2')(x)
        x = Add(name=f'add_block{block_idx}_2')([residual, x])

    # Global pooling and embedding layers
    x = GlobalAveragePooling2D(name='global_pool')(x)
    x = Flatten(name='flatten')(x)
    x = Dropout(0.5, name='dropout')(x)
    x = Dense(emb_size, use_bias=False, name='embedding')(x)
    
    # L2 normalization - critical for metric learning
    outputs = Lambda(lambda x: tf.nn.l2_normalize(x, axis=-1), 
                     name='l2_normalize')(x)

    model = Model(inputs=inputs, outputs=outputs, name='dogfacenet')
    
    return model


def triplet_loss(y_true, y_pred, alpha=0.3):
    """
    Triplet loss function for training (included for checkpoint compatibility).
    
    Args:
        y_true: Ground truth labels (not used in triplet loss)
        y_pred: Predicted embeddings in triplet format [anchor, positive, negative, ...]
        alpha: Margin for triplet loss
        
    Returns:
        Loss value
    """
    # Extract anchors, positives, and negatives
    anchor = y_pred[0::3]
    positive = y_pred[1::3]
    negative = y_pred[2::3]
    
    # Compute distances
    pos_dist = tf.reduce_sum(tf.square(anchor - positive), axis=-1)
    neg_dist = tf.reduce_sum(tf.square(anchor - negative), axis=-1)
    
    # Triplet loss with margin
    loss = tf.reduce_sum(tf.nn.relu(pos_dist - neg_dist + alpha))
    
    return loss


def triplet_accuracy(y_true, y_pred, alpha=0.3):
    """
    Triplet accuracy metric for training (included for checkpoint compatibility).
    
    Args:
        y_true: Ground truth labels (not used)
        y_pred: Predicted embeddings in triplet format
        alpha: Margin for triplet loss
        
    Returns:
        Accuracy metric
    """
    anchor = y_pred[0::3]
    positive = y_pred[1::3]
    negative = y_pred[2::3]
    
    pos_dist = tf.reduce_sum(tf.square(anchor - positive), axis=-1)
    neg_dist = tf.reduce_sum(tf.square(anchor - negative), axis=-1)
    
    return tf.less(pos_dist + alpha, neg_dist)
