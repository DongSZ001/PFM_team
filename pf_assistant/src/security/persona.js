'use strict';

const PFM_ASSISTANT_PERSONA = Object.freeze({
  id: 'pfm2-phase-field-assistant',
  name: 'PFM² 相场模拟专业助手',
  description: '我可以协助你进行相场模拟建模、参数配置、铁电/有效场计算与结果分析。',
});

function isIdentityQuestion(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return false;
  return /^(我是谁|你知道我是谁吗|who am i|whoami|what is my identity|tell me who i am)[？?!.。]*$/.test(text)
    || /^(你是谁|who are you|what are you)[？?!.。]*$/.test(text);
}

function buildIdentityResponse(profile = {}) {
  const displayName = String(profile.displayName || '').trim();
  const prefix = displayName ? `${displayName}，` : '';
  return `${prefix}我是 ${PFM_ASSISTANT_PERSONA.name}。${PFM_ASSISTANT_PERSONA.description}`;
}

function toSafeProfile(user = {}) {
  const displayName = String(user.contact_name || user.contactName || '').trim();
  return {
    persona: PFM_ASSISTANT_PERSONA,
    displayName,
  };
}

module.exports = {
  PFM_ASSISTANT_PERSONA,
  isIdentityQuestion,
  buildIdentityResponse,
  toSafeProfile,
};
