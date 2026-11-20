function calculateBalance(entries) {
  return Math.max(0, entries.reduce((sum, item) => sum + (item.type === 'DEPOSIT' ? Number(item.m3) : -Number(item.m3)), 0));
}
function insuranceScore(balanceM3, areaAcres) {
  if (Number(areaAcres) <= 0) return 0;
  return Math.min(100, Number(balanceM3) / (Number(areaAcres) * 40) * 100);
}
module.exports = { calculateBalance, insuranceScore };
