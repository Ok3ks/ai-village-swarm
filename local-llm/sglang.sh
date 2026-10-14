export SGLANG_USE_MLX=1 
python -m sglang.launch_server \ 
    --model-path mlx-community/Qwen3.8-27B-4bit \  
    --quantization mlx_q4 \  
    --disable-cuda-graph  \ 
    --host 127.0.0.1 \
    --port 30000
