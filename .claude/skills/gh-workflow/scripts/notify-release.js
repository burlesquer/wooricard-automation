#!/usr/bin/env node
// notify-release.js
// 우리카드 daemon release 직후 다중 사용자에게 Slack DM 일괄 발송.
// 사용:
//   NOTIFY_MESSAGE="..." node .claude/skills/gh-workflow/scripts/notify-release.js
//   옵션: NOTIFY_RECIPIENTS="U1,U2", NOTIFY_DRY_RUN=1
// 자세한 인터페이스는 references/notify-format.md 참조.

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');
const SLACK_LIB = path.join(PROJECT_ROOT, 'lib', 'slack.js');

function fail(msg) {
  console.error(`[notify-release] ERROR: ${msg}`);
  process.exit(1);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fail(`config.json not found at ${CONFIG_PATH}`);
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    fail(`config.json parse error: ${e.message}`);
  }
}

function resolveRecipients(config) {
  if (process.env.NOTIFY_RECIPIENTS) {
    return process.env.NOTIFY_RECIPIENTS.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const explicit = Array.isArray(config.releaseNotifyRecipients)
    ? config.releaseNotifyRecipients
    : [];
  const includeAccounts = config.releaseNotifyIncludeAccounts !== false; // default true
  const accountIds = includeAccounts
    ? (config.accounts || []).map((a) => a.slackId).filter(Boolean)
    : [];
  return Array.from(new Set([...explicit, ...accountIds]));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const message = process.env.NOTIFY_MESSAGE;
  if (!message || !message.trim()) fail('NOTIFY_MESSAGE env var required (and non-empty)');

  const config = loadConfig();
  if (!config.slackBotToken) fail('config.slackBotToken missing');

  const recipients = resolveRecipients(config);
  if (recipients.length === 0) {
    fail('no recipients (set config.releaseNotifyRecipients or NOTIFY_RECIPIENTS)');
  }

  const dryRun = process.env.NOTIFY_DRY_RUN === '1';
  console.error(`[notify-release] recipients (${recipients.length}): ${recipients.join(', ')}`);
  console.error(`[notify-release] message preview: ${message.split('\n')[0].slice(0, 200)}...`);
  if (dryRun) {
    console.error('[notify-release] DRY RUN — not sending');
    return;
  }

  if (!fs.existsSync(SLACK_LIB)) fail(`lib/slack.js not found at ${SLACK_LIB}`);
  const { createSlackClient } = require(SLACK_LIB);
  const slack = createSlackClient({ token: config.slackBotToken });

  const failed = [];
  for (const id of recipients) {
    try {
      await slack.send(message, id);
      console.error(`✓ sent to ${id}`);
    } catch (e) {
      console.error(`✗ failed for ${id}: ${e.message}`);
      failed.push(id);
    }
    await sleep(120); // rate limit cushion
  }

  if (failed.length > 0) {
    console.error(`[notify-release] failed recipients: ${failed.join(', ')}`);
    process.exit(2);
  }
  console.error(`[notify-release] all ${recipients.length} sent OK`);
})().catch((e) => fail(e.stack || e.message));
