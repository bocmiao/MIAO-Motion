param([string]$File, [int]$X, [int]$Y)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '仅允许隔离 Windows CI 执行原生文件拖放' }
$source = (Resolve-Path -LiteralPath $File).Path
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
[ComVisible(true), Guid("00000121-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface INativeDropSource {
  [PreserveSig] int QueryContinueDrag([MarshalAs(UnmanagedType.Bool)] bool escape, uint keys);
  [PreserveSig] int GiveFeedback(uint effect);
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class NativeDropSource : INativeDropSource {
  public int Released;
  uint previous = uint.MaxValue;
  public int QueryContinueDrag(bool escape, uint keys) {
    return escape ? 0x40101 : Interlocked.CompareExchange(ref Released, 0, 0) == 1 ? 0x40100 : 0;
  }
  public int GiveFeedback(uint effect) {
    if (effect != previous) Console.WriteLine("Native OLE feedback: " + effect);
    previous = effect;
    return 0x40102;
  }
}
public static class NativeFileDrop {
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  [DllImport("ole32.dll")] static extern int DoDragDrop([MarshalAs(UnmanagedType.Interface)] System.Runtime.InteropServices.ComTypes.IDataObject data, INativeDropSource source, uint allowed, out uint effect);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr info);
  public static void Run(string path, int x, int y) {
    Marshal.ThrowExceptionForHR(OleInitialize(IntPtr.Zero));
    var app = Process.GetProcessesByName("miao-motion")[0];
    ShowWindow(app.MainWindowHandle, 9);
    var point = new Point { X = x, Y = y };
    if (!ClientToScreen(app.MainWindowHandle, ref point)) throw new Exception("ClientToScreen failed");
    SetForegroundWindow(app.MainWindowHandle);
    var start = new System.Drawing.Point(Math.Max(0, point.X - 250), point.Y);
    Console.WriteLine("Native OLE drag coordinates: " + start + " -> " + point.X + "," + point.Y);
    try {
      // Native OLE owns the message loop; the target receives CF_HDROP through Windows.
      var source = new NativeDropSource();
      var data = new DataObject(DataFormats.FileDrop, new string[] { path });
      SetCursorPos(start.X, start.Y);
      mouse_event(2,0,0,0,UIntPtr.Zero);
      var mover = new Thread(() => {
        Thread.Sleep(500);
        for(int i=1;i<=20;i++) { SetCursorPos(start.X+(point.X-start.X)*i/20,start.Y+(point.Y-start.Y)*i/20); Thread.Sleep(40); }
        Thread.Sleep(1000);
        Console.WriteLine("Native OLE mouse released");
        Interlocked.Exchange(ref source.Released, 1);
        mouse_event(4,0,0,0,UIntPtr.Zero);
      }) { IsBackground = true };
      mover.Start();
      uint effect;
      int result;
      Console.WriteLine("Calling Windows DoDragDrop");
      try { result = DoDragDrop(data, source, 1, out effect); }
      finally { mover.Join(5000); mouse_event(4,0,0,0,UIntPtr.Zero); }
      Console.WriteLine("Native OLE drag result: " + result.ToString("X") + " / effect " + effect);
      Marshal.ThrowExceptionForHR(result);
      if (effect == 0) throw new Exception("Native file drop was rejected");
    } finally { OleUninitialize(); }
  }
}
'@
[NativeFileDrop]::Run($source, $X, $Y)
