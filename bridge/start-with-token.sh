#!/bin/bash
export OC_GATEWAY_TOKEN="${OC_GATEWAY_TOKEN:?Set OC_GATEWAY_TOKEN before starting bridge}"
cd /home/admin/.openclaw/workspace/pf-assistant-webui/bridge
node src/bridge.js
