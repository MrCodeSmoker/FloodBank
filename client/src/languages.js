import en from './i18n/en.json';
import hi from './i18n/hi.json';
import ta from './i18n/ta.json';
import te from './i18n/te.json';
import kn from './i18n/kn.json';
import ml from './i18n/ml.json';
import mr from './i18n/mr.json';
import bn from './i18n/bn.json';
import gu from './i18n/gu.json';
import or from './i18n/or.json';
import pa from './i18n/pa.json';
import as from './i18n/as.json';

export const catalogs = { en, hi, ta, te, kn, ml, mr, bn, gu, or, pa, as };
export const languages = Object.entries(catalogs).map(([code, catalog]) => ({ code, ...catalog._meta }));
export const resources = Object.fromEntries(Object.entries(catalogs).map(([code, catalog]) => [code, {
  translation: Object.fromEntries(Object.entries(catalog).filter(([key]) => !key.startsWith('_')))
}]));
