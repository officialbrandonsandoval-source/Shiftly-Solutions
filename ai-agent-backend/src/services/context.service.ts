import { Message, CustomerContext } from '../types/conversation';
import { logger } from '../utils/logger';

export interface ExtractedContext {
  vehicle_interest?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  trade_in?: Record<string, unknown>;
}

const VEHICLE_PATTERNS: { pattern: RegExp; field: string }[] = [
  { pattern: /(?:looking for|interested in|want|need|like)\s+(?:a\s+)?(\d{4})?\s*([\w-]+)\s+([\w-]+)/i, field: 'specific' },
  { pattern: /\b(sedan|suv|truck|coupe|van|minivan|convertible|hatchback|crossover)\b/i, field: 'type' },
  { pattern: /\b(new|used|pre-owned|certified|cpo)\b/i, field: 'condition' },
  { pattern: /\b(toyota|honda|ford|chevrolet|chevy|nissan|hyundai|kia|subaru|bmw|mercedes|audi|lexus|tesla|ram|dodge|jeep|gmc|volkswagen|vw|mazda|volvo)\b/i, field: 'make' },
  { pattern: /\b(camry|corolla|civic|accord|f-?150|silverado|rav4|cr-?v|highlander|pilot|tacoma|tundra|mustang|model\s*[3ys]|altima|elantra|sportage|outback|wrangler)\b/i, field: 'model' },
];

const BUDGET_PATTERNS: { pattern: RegExp; field: string }[] = [
  { pattern: /\$\s*([\d,]+)\s*(?:k|thousand)?/i, field: 'amount' },
  { pattern: /(\d+)\s*k\b/i, field: 'amount_k' },
  { pattern: /(?:budget|spend|afford|pay)\s+(?:is\s+)?(?:around|about|up to|max|under|less than)?\s*\$?([\d,]+)/i, field: 'budget_stated' },
  { pattern: /\$?([\d,]+)\s*(?:\/mo|per month|a month|monthly)/i, field: 'monthly' },
  { pattern: /(?:down payment|put down)\s+(?:of\s+)?\$?([\d,]+)/i, field: 'down_payment' },
  { pattern: /\b(finance|financing|lease|leasing|cash|loan)\b/i, field: 'payment_method' },
];

const TIMELINE_PATTERNS: { pattern: RegExp; urgency: string }[] = [
  { pattern: /\b(today|tonight|right now|asap|immediately|urgent)\b/i, urgency: 'immediate' },
  { pattern: /\b(tomorrow|this week|next few days|couple days)\b/i, urgency: 'this_week' },
  { pattern: /\b(this month|next week|couple weeks|few weeks|soon)\b/i, urgency: 'this_month' },
  { pattern: /\b(next month|couple months|few months)\b/i, urgency: 'next_few_months' },
  { pattern: /\b(just looking|browsing|no rush|not sure when|maybe later|someday|next year)\b/i, urgency: 'browsing' },
];

const TRADE_IN_PATTERNS: { pattern: RegExp; field: string }[] = [
  { pattern: /(?:trade|trading)\s*(?:in)?\s+(?:my\s+)?(\d{4})?\s*([\w-]+)?\s*([\w-]+)?/i, field: 'vehicle' },
  { pattern: /(?:driving|have|own)\s+(?:a\s+)?(\d{4})?\s*([\w-]+)\s*([\w-]+)/i, field: 'current_vehicle' },
  { pattern: /(\d{1,3}[,.]?\d{3,})\s*miles/i, field: 'mileage' },
];

export class ContextExtractionService {
  extractFromMessages(messages: Message[]): ExtractedContext {
    const customerMessages = messages.filter((m) => m.role === 'customer');
    if (customerMessages.length === 0) return {};

    const allText = customerMessages.map((m) => m.content).join(' ');
    const context: ExtractedContext = {};

    const vehicleInterest = this.extractVehicleInterest(allText);
    if (Object.keys(vehicleInterest).length > 0) {
      context.vehicle_interest = vehicleInterest;
    }

    const budget = this.extractBudget(allText);
    if (Object.keys(budget).length > 0) {
      context.budget = budget;
    }

    const timeline = this.extractTimeline(allText);
    if (Object.keys(timeline).length > 0) {
      context.timeline = timeline;
    }

    const tradeIn = this.extractTradeIn(allText);
    if (Object.keys(tradeIn).length > 0) {
      context.trade_in = tradeIn;
    }

    logger.debug('Context extracted', {
      hasVehicle: !!context.vehicle_interest,
      hasBudget: !!context.budget,
      hasTimeline: !!context.timeline,
      hasTradeIn: !!context.trade_in,
    });

    return context;
  }

  private extractVehicleInterest(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const { pattern, field } of VEHICLE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        if (field === 'specific') {
          if (match[1]) result.year = match[1];
          if (match[2]) result.make = match[2];
          if (match[3]) result.model = match[3];
        } else {
          result[field] = match[1] || match[0];
        }
      }
    }

    return result;
  }

  private extractBudget(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const { pattern, field } of BUDGET_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        if (field === 'amount') {
          const raw = match[1].replace(/,/g, '');
          const num = parseInt(raw, 10);
          result.total = text.toLowerCase().includes('k') ? num * 1000 : num;
        } else if (field === 'amount_k') {
          result.total = parseInt(match[1], 10) * 1000;
        } else if (field === 'budget_stated') {
          // Only set total if not already extracted by a more specific pattern
          if (!result.total) {
            result.total = parseInt(match[1].replace(/,/g, ''), 10);
          }
        } else if (field === 'monthly') {
          result.monthly_payment = parseInt(match[1].replace(/,/g, ''), 10);
        } else if (field === 'down_payment') {
          result.down_payment = parseInt(match[1].replace(/,/g, ''), 10);
        } else if (field === 'payment_method') {
          result.payment_method = match[1].toLowerCase();
        }
      }
    }

    return result;
  }

  private extractTimeline(text: string): Record<string, unknown> {
    for (const { pattern, urgency } of TIMELINE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return { urgency, keyword: match[1] || match[0] };
      }
    }
    return {};
  }

  private extractTradeIn(text: string): Record<string, unknown> {
    const lower = text.toLowerCase();
    const hasTradeInIntent =
      lower.includes('trade-in') ||
      lower.includes('trade in') ||
      lower.includes('trading in') ||
      lower.includes('value of my');

    if (!hasTradeInIntent) return {};

    const result: Record<string, unknown> = { has_trade_in: true };

    for (const { pattern, field } of TRADE_IN_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        if (field === 'mileage') {
          result.mileage = parseInt(match[1].replace(/[,.]/, ''), 10);
        } else if (match[1] || match[2]) {
          if (match[1]) result.year = match[1];
          if (match[2]) result.make = match[2];
          if (match[3]) result.model = match[3];
        }
      }
    }

    return result;
  }
}
