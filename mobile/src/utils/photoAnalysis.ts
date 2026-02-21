/**
 * On-device photo quality analysis for stray animal identification.
 * Analyzes brightness, sharpness, and subject coverage to guide users
 * toward photos that work well for AI vector similarity search.
 *
 * Thresholds are calibrated from real phone-camera photos resized to 100×100:
 *   - Sharpness:  sharp real photo ≈ 20-25; blurry ≈ <8
 *   - Coverage:   subject fills frame ≈ 55-80; too far ≈ 30-55; no subject ≈ <30
 */

import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "jpeg-js";

export type PhotoQuality = "good" | "okay" | "poor";

export interface PhotoAnalysis {
  quality: PhotoQuality;
  feedback: string;
  brightness: number;
  sharpness: number;
  coverage: number;
}

const SIZE = 100;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function computeBrightness(data: Uint8Array, width: number, height: number): number {
  let sum = 0;
  const total = width * height;
  for (let i = 0; i < total * 4; i += 4) {
    sum += luminance(data[i], data[i + 1], data[i + 2]);
  }
  return sum / total;
}

/**
 * Average gradient magnitude at the 100×100 scale.
 * Sharp real-world photos give ~20-25; motion blur / out-of-focus gives <8.
 */
function computeSharpness(data: Uint8Array, width: number, height: number): number {
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const L = luminance(data[i], data[i + 1], data[i + 2]);
      if (x < width - 1) {
        const j = (y * width + (x + 1)) * 4;
        sum += Math.abs(L - luminance(data[j], data[j + 1], data[j + 2]));
      }
      if (y < height - 1) {
        const j = ((y + 1) * width + x) * 4;
        sum += Math.abs(L - luminance(data[j], data[j + 1], data[j + 2]));
      }
    }
  }
  return sum / (width * height);
}

/**
 * Subject coverage: absolute brightness difference between the center 50% region
 * and the surrounding outer ring.  When an animal fills the frame it contrasts
 * strongly against the background, giving a high value.  When the subject is
 * small or off-centre the entire image looks similar, giving a low value.
 *
 * Calibrated values (100×100 resize):
 *   Subject fills frame → ~55-80
 *   Subject too far / partially visible → ~30-55
 *   No clear subject / all background → ~<30
 */
function computeCoverage(data: Uint8Array, width: number, height: number): number {
  const q1 = Math.floor(width / 4);
  const q3 = width - q1;
  const r1 = Math.floor(height / 4);
  const r3 = height - r1;

  let centerSum = 0;
  let centerCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const L = luminance(data[i], data[i + 1], data[i + 2]);
      if (x >= q1 && x < q3 && y >= r1 && y < r3) {
        centerSum += L;
        centerCount += 1;
      } else {
        edgeSum += L;
        edgeCount += 1;
      }
    }
  }

  const centerMean = centerCount > 0 ? centerSum / centerCount : 128;
  const edgeMean = edgeCount > 0 ? edgeSum / edgeCount : 128;
  return Math.abs(centerMean - edgeMean);
}

function toFeedback(
  brightness: number,
  sharpness: number,
  coverage: number,
): { quality: PhotoQuality; feedback: string } {
  // Lighting checks (highest priority)
  if (brightness < 45) {
    return { quality: "poor", feedback: "Too dark — move to a brighter area" };
  }
  if (brightness > 215) {
    return { quality: "poor", feedback: "Too bright — avoid direct sunlight" };
  }

  // Blur check
  if (sharpness < 8) {
    return { quality: "poor", feedback: "Photo is blurry — hold your phone steady" };
  }

  // Subject coverage checks
  if (coverage < 28) {
    return { quality: "poor", feedback: "Animal not visible — position it in the center of the frame" };
  }
  if (coverage < 52) {
    return { quality: "okay", feedback: "Animal is too far away — move closer and zoom in" };
  }

  // Secondary quality hints
  if (brightness >= 45 && brightness < 65) {
    return { quality: "okay", feedback: "A bit dark — better lighting improves matching accuracy" };
  }
  if (sharpness >= 8 && sharpness < 16) {
    return { quality: "okay", feedback: "Quality could be better — try getting closer or steadier" };
  }

  return { quality: "good", feedback: "Great photo! Ready for matching" };
}

export async function analyzePhoto(uri: string): Promise<PhotoAnalysis> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: SIZE, height: SIZE } }],
      { base64: true, format: ImageManipulator.SaveFormat.JPEG },
    );

    const base64 = result.base64;
    if (!base64) {
      return fallbackAnalysis("Photo captured — quality may vary");
    }

    const bytes = base64ToUint8Array(base64);
    const decoded = decode(bytes, { useTArray: true });
    const data = decoded.data as Uint8Array;
    const { width, height } = decoded;

    const brightness = computeBrightness(data, width, height);
    const sharpness = computeSharpness(data, width, height);
    const coverage = computeCoverage(data, width, height);

    const { quality, feedback } = toFeedback(brightness, sharpness, coverage);

    return { quality, feedback, brightness, sharpness, coverage };
  } catch {
    return fallbackAnalysis("Photo captured — quality may vary");
  }
}

function fallbackAnalysis(feedback: string): PhotoAnalysis {
  return {
    quality: "okay",
    feedback,
    brightness: 128,
    sharpness: 20,
    coverage: 50,
  };
}
