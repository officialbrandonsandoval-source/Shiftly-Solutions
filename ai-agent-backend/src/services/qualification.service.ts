import { Message } from '../types/conversation';
import { logger } from '../utils/logger';

interface QualificationFactors {
  vehicleInterest: number;
  budgetMentioned: number;
  timelineUrgency: number;
  tradeInMentioned: number;
  engagementLevel: number;
}

const VEHICLE_KEYWORDS = [
  'sedan', 'suv', 'truck', 'coupe', 'van', 'minivan', 'convertible', 'hatchback',
  'camry', 'corolla', 'civic', 'accord', 'f-150', 'f150', 'silverado', 'ram',
  'rav4', 'cr-v', 'crv', 'highlander', 'pilot', 'tacoma', 'tundra', 'mustang',
  'tesla', 'model 3', 'model y', 'bmw', 'mercedes', 'audi', 'lexus', 'honda',
  'toyota', 'ford', 'chevrolet', 'chevy', 'nissan', 'hyundai', 'kia', 'subaru',
  'new car', 'used car', 'pre-owned', 'certified', 'vehicle', 'car', 'auto',
];

const BUDGET_KEYWORDS = [
  'budget', 'price', 'cost', 'afford', 'payment', 'monthly', 'down payment',
  'finance', 'financing', 'lease', 'leasing', 'loan', 'apr', 'interest rate',
  '$', 'thousand', 'per month', '/mo', 'a month',
];

const TIMELINE_URGENT_KEYWORDS = ['today', 'tomorrow', 'asap', 'right now', 'this week', 'urgent', 'immediately'];
const TIMELINE_SOON_KEYWORDS = ['this month', 'next week', 'soon', 'couple weeks', 'few days'];
const TIMELINE_BROWSING_KEYWORDS = ['just looking', 'browsing', 'maybe later', 'not sure when', 'no rush', 'someday'];

const TRADE_IN_KEYWORDS = [
  'trade-in', 'trade in', 'trading in', 'current car', 'my car', 'selling my',
  'what can i get', 'worth', 'value of my',
];

export class QualificationService {
  async scoreConversation(conversationId: string, messages?: Message[]): Promise<number> {
    if (!messages || messages.length === 0) {
      logger.debug('No messages for qualification scoring', { conversationId });
      return 0;
    }

    const customerMessages = messages.filter((m) => m.role === 'customer');
    if (customerMessages.length === 0) {
      return 0;
    }

    const allCustomerText = customerMessages.map((m) => m.content.toLowerCase()).join(' ');
    const factors = this.analyzeFactors(allCustomerText, customerMessages.length);
    const score = this.calculateScore(factors);

    logger.info('Qualification score computed', {
      conversationId,
      score,
      factors,
    });

    return score;
  }

  private analyzeFactors(text: string, messageCount: number): QualificationFactors {
    return {
      vehicleInterest: this.scoreVehicleInterest(text),
      budgetMentioned: this.scoreBudget(text),
      timelineUrgency: this.scoreTimeline(text),
      tradeInMentioned: this.scoreTradeIn(text),
      engagementLevel: this.scoreEngagement(messageCount),
    };
  }

  private scoreVehicleInterest(text: string): number {
    let score = 0;
    const matches = VEHICLE_KEYWORDS.filter((kw) => text.includes(kw));

    if (matches.length === 0) return 0;
    if (matches.length === 1) score = 10;
    else if (matches.length === 2) score = 18;
    else score = 25;

    return score;
  }

  private scoreBudget(text: string): number {
    const matches = BUDGET_KEYWORDS.filter((kw) => text.includes(kw));
    if (matches.length === 0) return 0;

    // Check for specific dollar amounts
    const hasDollarAmount = /\$[\d,]+/.test(text) || /\d{2,}k/i.test(text);
    if (hasDollarAmount) return 25;

    if (matches.length >= 2) return 20;
    return 12;
  }

  private scoreTimeline(text: string): number {
    if (TIMELINE_URGENT_KEYWORDS.some((kw) => text.includes(kw))) return 25;
    if (TIMELINE_SOON_KEYWORDS.some((kw) => text.includes(kw))) return 18;
    if (TIMELINE_BROWSING_KEYWORDS.some((kw) => text.includes(kw))) return 5;
    return 0;
  }

  private scoreTradeIn(text: string): number {
    const matches = TRADE_IN_KEYWORDS.filter((kw) => text.includes(kw));
    if (matches.length === 0) return 0;
    return matches.length >= 2 ? 15 : 10;
  }

  private scoreEngagement(messageCount: number): number {
    if (messageCount >= 10) return 10;
    if (messageCount >= 5) return 7;
    if (messageCount >= 3) return 5;
    if (messageCount >= 1) return 2;
    return 0;
  }

  private calculateScore(factors: QualificationFactors): number {
    const raw =
      factors.vehicleInterest +
      factors.budgetMentioned +
      factors.timelineUrgency +
      factors.tradeInMentioned +
      factors.engagementLevel;

    // Clamp to 0-100
    return Math.min(100, Math.max(0, raw));
  }
}
