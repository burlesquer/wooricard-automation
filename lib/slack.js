const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');

function createSlackClient({ token, disabled }) {
  if (!token && !disabled) {
    throw new Error('SLACK_BOT_TOKEN environment variable is required (or pass --no-slack)');
  }
  const client = token ? new WebClient(token) : null;

  async function send(msg, targetId) {
    if (!client) {
      console.error('[sendSlack skipped — no token]');
      return;
    }
    if (!targetId) {
      console.error('[sendSlack skipped — no targetId provided]');
      return;
    }
    try {
      await client.chat.postMessage({ channel: targetId, text: msg });
    } catch (e) {
      const errMsg = (e && e.message ? e.message : String(e)).substring(0, 200);
      console.error('Slack send failed:', errMsg);
    }
  }

  // Upload a file to a user DM (opens IM channel first) or channel id.
  async function uploadFile(targetId, filePath, { title, initialComment } = {}) {
    if (!client) {
      console.error('[uploadFile skipped — no token]');
      return null;
    }
    if (!targetId || !filePath) {
      console.error('[uploadFile skipped — missing targetId or filePath]');
      return null;
    }
    if (!fs.existsSync(filePath)) {
      console.error(`[uploadFile] File not found: ${filePath}`);
      return null;
    }
    try {
      // If target is a user ID (starts with U), open IM channel first
      let channelId = targetId;
      if (/^U/.test(targetId)) {
        const im = await client.conversations.open({ users: targetId });
        channelId = im.channel.id;
      }
      const res = await client.files.uploadV2({
        channel_id: channelId,
        file: fs.createReadStream(filePath),
        filename: path.basename(filePath),
        title,
        initial_comment: initialComment,
      });
      return res;
    } catch (e) {
      const errMsg = (e && e.data && e.data.error) ? e.data.error : (e && e.message) ? e.message : String(e);
      console.error('Slack uploadFile failed:', errMsg.substring(0, 200));
      return null;
    }
  }

  return { send, uploadFile };
}

function buildPersonalDM(r, dateRange, remainingAmount) {
  const month = new Date()
    .toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long' })
    .replace('월', '');
  const diff = r.totalAmount - r.prevAmount;
  const diffStr = diff >= 0
    ? `(+${diff.toLocaleString()}원)`
    : `(-${Math.abs(diff).toLocaleString()}원)`;

  let msg = `💳 ${month}월 법인카드 이용내역 업데이트\n\n`;
  msg += `기간: ${dateRange}\n`;
  msg += `사용금액: ${r.prevAmount.toLocaleString()}원 → ${r.totalAmount.toLocaleString()}원 ${diffStr}\n`;

  if (remainingAmount !== null && remainingAmount !== undefined) {
    msg += `잔여 복리후생비: ${Number(remainingAmount).toLocaleString()}원\n`;
  }

  if (r.newItems && r.newItems.length > 0) {
    msg += `\n📌 신규 내역\n\n`;
    for (const it of r.newItems) {
      msg += `${it.date} ${(it.merchant || '').trim()} ${it.amount.toLocaleString()}원\n`;
    }
  }

  if (r.items && r.items.length > 0) {
    msg += `\n📋 전체 내역\n\n`;
    for (const it of r.items) {
      msg += `${it.date} ${(it.merchant || '').trim()} ${it.amount.toLocaleString()}원\n`;
    }
  }

  return msg.trim();
}

function buildBriefingDM(r, dateRange) {
  const { account, totalAmount, availableAmount, remainingBalance, prevBalance } = r;
  const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const month = nowKst.getMonth() + 1;
  const usagePct = availableAmount > 0 ? Math.round((totalAmount / availableAmount) * 100) : 0;

  const lastDay = new Date(nowKst.getFullYear(), nowKst.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, lastDay - nowKst.getDate() + 1);
  const dailyBudget = daysLeft > 0 ? Math.floor(remainingBalance / daysLeft) : 0;
  const monthlyCredit = availableAmount - prevBalance;

  let msg = `☀️ 좋은 아침, ${account.name}님! ${month}월 법인카드 브리핑\n`;
  msg += `기간: ${dateRange}\n\n`;
  msg += `💳 사용가능금액: ${availableAmount.toLocaleString()}원\n`;
  msg += `   └ 전월잔액 ${prevBalance.toLocaleString()}원 + 이번달 크레딧 ${monthlyCredit.toLocaleString()}원\n`;
  msg += `💸 현재 사용금액: ${totalAmount.toLocaleString()}원 (${usagePct}%)\n`;
  msg += `💰 남은 잔액: ${remainingBalance.toLocaleString()}원\n\n`;
  msg += `📅 ${month}월 남은 일수: ${daysLeft}일\n`;
  msg += `💡 일평균 사용 가능: ${dailyBudget.toLocaleString()}원`;

  return msg.trim();
}

module.exports = { createSlackClient, buildPersonalDM, buildBriefingDM };
