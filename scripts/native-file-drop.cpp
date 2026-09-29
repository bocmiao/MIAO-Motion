// CI only: deliver Explorer's real file data object through Windows OLE.
#define NOMINMAX
#include <windows.h>
#include <shlobj.h>
#include <wrl/client.h>
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <iostream>
#include <thread>

using Microsoft::WRL::ComPtr;

class FileDropSource final : public IDropSource {
  std::atomic<ULONG> references{1};
  DWORD previous = ~DWORD(0);
public:
  std::atomic<bool> released{false};
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** object) override {
    if (iid == IID_IUnknown || iid == IID_IDropSource) {
      *object = static_cast<IDropSource*>(this); AddRef(); return S_OK;
    }
    *object = nullptr; return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
  ULONG STDMETHODCALLTYPE Release() override {
    const auto remaining = --references;
    if (!remaining) delete this;
    return remaining;
  }
  HRESULT STDMETHODCALLTYPE QueryContinueDrag(BOOL escape, DWORD) override {
    if (escape) return DRAGDROP_S_CANCEL;
    return released ? DRAGDROP_S_DROP : S_OK;
  }
  HRESULT STDMETHODCALLTYPE GiveFeedback(DWORD effect) override {
    if (previous != effect) std::cout << "OLE feedback: " << effect << std::endl;
    previous = effect;
    return DRAGDROP_S_USEDEFAULTCURSORS;
  }
};

int wmain(int argc, wchar_t** argv) {
  const auto ci = _wgetenv(L"GITHUB_ACTIONS");
  if (!ci || wcscmp(ci, L"true") || argc != 5) return 2;
  auto hr = OleInitialize(nullptr);
  if (FAILED(hr)) return 3;
  int result = 1;
  {
    PIDLIST_ABSOLUTE item = nullptr;
    ComPtr<IShellFolder> folder;
    ComPtr<IDataObject> data;
    PCUITEMID_CHILD child = nullptr;
    hr = SHParseDisplayName(argv[1], nullptr, &item, 0, nullptr);
    if (SUCCEEDED(hr)) hr = SHBindToParent(item, IID_PPV_ARGS(&folder), &child);
    if (SUCCEEDED(hr)) hr = folder->GetUIObjectOf(nullptr, 1, &child, IID_IDataObject, nullptr, reinterpret_cast<void**>(data.GetAddressOf()));
    if (SUCCEEDED(hr)) {
      const auto window = reinterpret_cast<HWND>(_wcstoui64(argv[2], nullptr, 10));
      POINT target{_wtoi(argv[3]), _wtoi(argv[4])};
      if (!ClientToScreen(window, &target)) hr = E_FAIL;
      else {
        ShowWindow(window, SW_RESTORE);
        SetForegroundWindow(window);
        const POINT start{std::max(0L, target.x - 250), target.y};
        ComPtr<FileDropSource> source;
        source.Attach(new FileDropSource());
        SetCursorPos(start.x, start.y);
        std::thread mover([&] {
          // Let OLE capture input before pressing: clicking the WebView first
          // starts its own pointer/OrbitControls capture and can block DragEnter.
          Sleep(500);
          mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
          for (int i = 1; i <= 20; ++i) {
            SetCursorPos(start.x + (target.x - start.x) * i / 20, start.y + (target.y - start.y) * i / 20);
            Sleep(40);
          }
          Sleep(1000);
          source->released = true;
          mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
          std::cout << "OLE mouse released" << std::endl;
        });
        DWORD effect = 0;
        std::cout << "Starting native Shell file drag" << std::endl;
        hr = DoDragDrop(data.Get(), source.Get(), DROPEFFECT_COPY, &effect);
        mover.join();
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        std::cout << "OLE result: " << std::hex << hr << " / effect " << effect << std::endl;
        if (SUCCEEDED(hr) && effect == DROPEFFECT_COPY) result = 0;
      }
    }
    if (FAILED(hr)) std::cerr << "Native file drag failed: " << std::hex << hr << std::endl;
    CoTaskMemFree(item);
  }
  OleUninitialize();
  return result;
}
