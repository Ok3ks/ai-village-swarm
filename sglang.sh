SGLANG_USE_MLX=1 python -m sglang.launch_server   --model-path Qwen/Qwen3-0.6B   --quantization mlx_q4   --disable-cuda-graph   --host 127.0.0.1 --port 30000
