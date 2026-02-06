import { CRMAdapter, CRMConfig } from '../../types/crm';
import { GoHighLevelAdapter } from './ghl.adapter';

export class CRMFactory {
  static create(crmType: string, config: CRMConfig): CRMAdapter {
    switch (crmType) {
      case 'gohighlevel':
        return new GoHighLevelAdapter(config);
      default:
        throw new Error(`Unsupported CRM type: ${crmType}`);
    }
  }
}
