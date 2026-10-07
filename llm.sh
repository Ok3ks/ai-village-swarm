# works on a mac, requires vllm-metal not vllm tap
vllm serve mlx-community/Qwen3.8-27B-4bit \
  --max-model-len 32768 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --reasoning-parser qwen3