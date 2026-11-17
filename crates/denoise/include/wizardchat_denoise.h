#pragma once

#include <stddef.h>

typedef struct WzDenoiser WzDenoiser;

WzDenoiser *wz_denoise_new(float scale);
float wz_denoise_process(WzDenoiser *denoiser, float *samples, size_t len);
void wz_denoise_free(WzDenoiser *denoiser);
