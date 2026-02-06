import { Message } from '../types/conversation';
import { logger } from '../utils/logger';

export interface EscalationResult {
  shouldEscalate: boolean;
  reason: string | null;
  confidence: number;
}

const FRUSTRATION_KEYWORDS = [
  'speak to a person', 'speak to someone', 'talk to a person', 'talk to someone',
  'real person', 'real human', 'human agent', 'human being', 'not a bot',
  'stop texting me', 'stop messaging', 'leave me alone',
  'this is ridiculous', 'this is stupid', 'waste of time', 'terrible',
  'worst experience', 'never coming back', 'horrible', 'awful',
  'you suck', 'useless', 'incompetent',
  'manager', 'supervisor', 'complaint', 'complain', 'lawyer', 'attorney',
  'better business bureau', 'bbb',
];

const EXPLICIT_ESCALATION_KEYWORDS = [
  'speak to a human', 'talk to a human', 'transfer me', 'connect me',
  'real person', 'live person', 'live agent', 'human please',
  'get me someone', 'let me speak', 'operator', 'representative',
];

const COMPLEX_TOPIC_KEYWORDS = [
  'warranty claim', 'recall', 'lemon law', 'accident', 'insurance claim',
  'legal', 'lawsuit', 'refund', 'return the car', 'dispute',
  'mechanical issue', 'defect', 'broke down', 'not working',
];

export class EscalationService {
  evaluate(messages: Message[]): EscalationResult {
    const customerMessages = messages.filter((m) => m.role === 'customer');
    if (customerMessages.length === 0) {
      return { shouldEscalate: false, reason: null, confidence: 0 };
    }

    const recentMessages = customerMessages.slice(-5);
    const recentText = recentMessages.map((m) => m.content.toLowerCase()).join(' ');
    const allCustomerText = customerMessages.map((m) => m.content.toLowerCase()).join(' ');

    // Check explicit escalation requests (highest priority)
    const explicitMatch = EXPLICIT_ESCALATION_KEYWORDS.find((kw) => recentText.includes(kw));
    if (explicitMatch) {
      logger.info('Escalation triggered: explicit request', { keyword: explicitMatch });
      return {
        shouldEscalate: true,
        reason: `Customer explicitly requested human agent: "${explicitMatch}"`,
        confidence: 0.95,
      };
    }

    // Check frustration signals
    const frustrationMatches = FRUSTRATION_KEYWORDS.filter((kw) => recentText.includes(kw));
    if (frustrationMatches.length >= 2) {
      logger.info('Escalation triggered: multiple frustration signals', { matches: frustrationMatches });
      return {
        shouldEscalate: true,
        reason: `Customer showing frustration: ${frustrationMatches.join(', ')}`,
        confidence: 0.85,
      };
    }

    if (frustrationMatches.length === 1) {
      // Single frustration keyword — escalate if repeated messages
      const hasRepeatedContent = this.hasRepeatedMessages(recentMessages);
      if (hasRepeatedContent) {
        logger.info('Escalation triggered: frustration + repeated messages');
        return {
          shouldEscalate: true,
          reason: 'Customer frustrated and repeating themselves',
          confidence: 0.80,
        };
      }
    }

    // Check complex topics beyond AI scope
    const complexMatch = COMPLEX_TOPIC_KEYWORDS.find((kw) => recentText.includes(kw));
    if (complexMatch) {
      logger.info('Escalation triggered: complex topic', { keyword: complexMatch });
      return {
        shouldEscalate: true,
        reason: `Complex topic requiring human: "${complexMatch}"`,
        confidence: 0.75,
      };
    }

    // Check for repeated identical messages (customer not getting help)
    if (this.hasRepeatedMessages(recentMessages) && recentMessages.length >= 3) {
      logger.info('Escalation triggered: repeated messages without resolution');
      return {
        shouldEscalate: true,
        reason: 'Customer repeating themselves — may need human assistance',
        confidence: 0.70,
      };
    }

    // Check for long conversation without progress
    if (customerMessages.length >= 15) {
      logger.info('Escalation suggested: long conversation', { messageCount: customerMessages.length });
      return {
        shouldEscalate: true,
        reason: 'Long conversation — may benefit from human follow-up',
        confidence: 0.55,
      };
    }

    return { shouldEscalate: false, reason: null, confidence: 0 };
  }

  private hasRepeatedMessages(messages: Message[]): boolean {
    if (messages.length < 2) return false;

    const contents = messages.map((m) => m.content.toLowerCase().trim());
    for (let i = 1; i < contents.length; i++) {
      if (contents[i] === contents[i - 1]) return true;
      // Fuzzy match: check if messages are very similar
      if (this.similarity(contents[i], contents[i - 1]) > 0.8) return true;
    }
    return false;
  }

  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const editDist = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDist) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
