export interface AdData {
  platform: string;
  accountName: string;
  nama: string;
  hasil: number;
  indikator: string;
  cpl: number;
  spend: number;
}
 
export interface ViewerData {
  tayangan: number;
}
 
export interface AccountStat {
  name: string;
  leads: number;
  spend: number;
  cpl: number;
  engFB: number;
  engIG: number;
}
 
export interface DashboardStats {
  totalViewers: number;
  pctViewers: number;
  totalLeads: number;
  totalSpend: number;
  avgCPL: number;
  cplFB: number;
  cplIG: number;
  engFB: number;
  engIG: number;
  bestCampaign: AdData | null;
  worstCampaign: AdData | null;
  top4: AdData[];
  bottom4: AdData[];
  accountStats: AccountStat[];
}
 
export interface MonthlyHistory {
  month: string;
  viewers: number;
  leads: number;
  spend: number;
  cpl: number;
}