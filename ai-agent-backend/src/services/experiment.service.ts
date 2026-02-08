import crypto from 'crypto';

export class ExperimentService {
  /**
   * Deterministically assigns a variant ('A' or 'B') based on a conversation ID
   * and an A/B split ratio. Uses SHA-256 hash for even distribution.
   */
  getVariant(conversationId: string, ratio: number = 0.5): 'A' | 'B' {
    const hash = crypto.createHash('sha256').update(conversationId).digest('hex');
    const value = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
    return value < ratio ? 'A' : 'B';
  }
}
