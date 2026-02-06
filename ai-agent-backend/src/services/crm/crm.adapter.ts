import { CRMAdapter, CRMConfig } from '../../types/crm';

export class CRMFactory {
  static create(crmType: string, config: CRMConfig): CRMAdapter {
    switch (crmType) {
      case 'gohighlevel':
        // Will be implemented in Week 4
        throw new Error('GoHighLevel adapter not yet implemented');
      default:
        throw new Error(`Unsupported CRM type: ${crmType}`);
    }
  }
}
