#include <softcam/softcam.h>
#include <windows.h>
#include <vector>
int main() {
    auto camera = scCreateCamera(640, 360, 0);
    if (!camera) return 1;
    std::vector<unsigned char> frame(640 * 360 * 3);
    // BGR bottom-up: distinguish all four corners to detect swaps and flips.
    for (int y = 0; y < 360; ++y) for (int x = 0; x < 640; ++x) {
        auto i = (y * 640 + x) * 3;
        frame[i] = x < 320 ? 0 : 255;
        frame[i + 1] = y < 180 ? 255 : 0;
        frame[i + 2] = x < 320 ? 255 : 0;
    }
    for (int i = 0; i < 600; ++i) { scSendFrame(camera, frame.data()); Sleep(33); }
    scDeleteCamera(camera);
    return 0;
}
