import type { Confidence, ConfidenceProfile, SourceQuality } from '../types.js';

export function sourceConfidence(quality: SourceQuality): Confidence {
  if (quality === 'verified' || quality === 'authoritative') return 'high';
  if (quality === 'community' || quality === 'manual') return 'medium';
  return 'low';
}

export function confidenceLabel(profile: ConfidenceProfile): 'Verified' | 'Good estimate' | 'Estimated' | 'Rough estimate' {
  if (profile.identity === 'high' && profile.quantity === 'high' && profile.nutrition === 'high') return 'Verified';
  const lows = [profile.identity, profile.quantity, profile.nutrition].filter(x => x === 'low').length;
  if (lows >= 2) return 'Rough estimate';
  if (lows === 1 || profile.quantity === 'low') return 'Estimated';
  return 'Good estimate';
}

export function learnedConfidence(observationCount: number): Confidence {
  if (observationCount >= 8) return 'high';
  if (observationCount >= 3) return 'medium';
  return 'low';
}
