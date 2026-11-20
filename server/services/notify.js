function notify(farmer, alert) {
  console.log(`[notify stub] ${farmer.phone}: ${alert.text}`);
  // TODO(spec): connect WhatsApp/SMS delivery here.
}
module.exports = { notify };
