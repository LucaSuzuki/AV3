export interface VersaoPublica {
  versao: string;
  status: 'ESTAVEL' | 'DEPRECIADA';
  depreciadaEm: Date | null;
  sunsetEm: Date | null;
  sucessora: string | null;
}

export const versoes: { v1: VersaoPublica } = {
  v1: { versao: '1.0.0', status: 'ESTAVEL', depreciadaEm: null, sunsetEm: null, sucessora: null },
};
