const nodemailer = require('nodemailer');

// Create a Gmail SMTP client. Requires Google app password (2FA must be enabled).
// If disabled (CLI --no-gmail) or credentials missing, returns a no-op client.
function createGmailClient({ user, password, disabled }) {
  if (disabled) {
    return {
      send: async () => { console.error('[gmail skipped — disabled]'); },
      enabled: false,
    };
  }
  if (!user || !password) {
    return {
      send: async () => { console.error('[gmail skipped — user/password missing in config]'); },
      enabled: false,
    };
  }

  // Strip whitespace from app password (Google displays with spaces for readability)
  const cleanPassword = String(password).replace(/\s+/g, '');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: cleanPassword },
  });

  async function send({ to, subject, text }) {
    if (!to) {
      console.error('[gmail skipped — no recipient]');
      return false;
    }
    try {
      await transporter.sendMail({ from: user, to, subject, text });
      return true;
    } catch (e) {
      const msg = (e && e.message ? e.message : String(e)).substring(0, 200);
      console.error(`[gmail send failed: ${msg}]`);
      return false;
    }
  }

  return { send, enabled: true };
}

// Compose a per-transaction email.
// account: { name, cardSuffix }
// item: { date, approvalNo, merchant, amount, bizNo, category, addr, tel }
// ctx: { year, availableAmount, totalAmount, remainingBalance }
function buildTransactionEmail(account, item, ctx) {
  const cleanMerchant = (item.merchant || '').trim();
  const subject = `[우리카드 법인] ${account.name} ${item.date} ${cleanMerchant} ${item.amount.toLocaleString()}원`;

  const lines = [
    '[법인카드]',
    '',
    `이름: ${account.name}`,
    `카드: 5532-****-****-${account.cardSuffix}`,
    `일자: ${ctx.year}.${item.date}`,
    `가맹점: ${cleanMerchant}`,
    `금액: ${item.amount.toLocaleString()}원`,
  ];

  const hasDetails = item.bizNo || item.category || item.addr || item.tel;
  if (hasDetails) {
    lines.push('', '가맹점 정보', '');
    if (item.bizNo)    lines.push(`사업자번호: ${item.bizNo}`);
    if (item.category) lines.push(`업종: ${item.category}`);
    if (item.addr)     lines.push(`주소: ${item.addr}`);
    if (item.tel)      lines.push(`전화: ${item.tel}`);
  }

  return { subject, text: lines.join('\n') };
}

module.exports = { createGmailClient, buildTransactionEmail };
