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
public static class NativeFileDrop {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr info);
  public static void Run(string path, int x, int y) {
    if (Application.OleRequired() != ApartmentState.STA) throw new Exception("Native drag requires an OLE STA thread");
    var app = Process.GetProcessesByName("miao-motion")[0];
    ShowWindow(app.MainWindowHandle, 9);
    var point = new Point { X = x, Y = y };
    if (!ClientToScreen(app.MainWindowHandle, ref point)) throw new Exception("ClientToScreen failed");
    SetForegroundWindow(app.MainWindowHandle);
    var start = new System.Drawing.Point(Math.Max(0, point.X - 250), point.Y);
    Console.WriteLine("Native OLE drag coordinates: " + start + " -> " + point.X + "," + point.Y);
    using (var source = new Control()) {
      // DoDragDrop owns the native OLE message loop; no visible source window is needed.
      // The actual target still receives CF_HDROP through Windows, never a DOM event.
      var data = new DataObject(DataFormats.FileDrop, new string[] { path });
      int released = 0;
      // A programmatic OLE source has no MouseDown message in its own queue.
      // Keep the native loop active until our real mouse release instead of treating
      // that initially empty queue as an immediate drop.
      source.QueryContinueDrag += (sender, args) => {
        args.Action = args.EscapePressed ? DragAction.Cancel :
          Interlocked.CompareExchange(ref released, 0, 0) == 1 ? DragAction.Drop : DragAction.Continue;
      };
      DragDropEffects previous = (DragDropEffects)(-1);
      source.GiveFeedback += (sender, args) => {
        if (previous != args.Effect) Console.WriteLine("Native OLE feedback: " + args.Effect);
        previous = args.Effect;
      };
      SetCursorPos(start.X, start.Y);
      mouse_event(2,0,0,0,UIntPtr.Zero);
      var mover = new Thread(() => {
        Thread.Sleep(500);
        for(int i=1;i<=20;i++) { SetCursorPos(start.X+(point.X-start.X)*i/20,start.Y+(point.Y-start.Y)*i/20); Thread.Sleep(40); }
        Thread.Sleep(1000);
        Interlocked.Exchange(ref released, 1);
        mouse_event(4,0,0,0,UIntPtr.Zero);
      }) { IsBackground = true };
      mover.Start();
      DragDropEffects effect;
      try { effect = source.DoDragDrop(data, DragDropEffects.Copy); }
      finally { mover.Join(5000); mouse_event(4,0,0,0,UIntPtr.Zero); }
      Console.WriteLine("Native OLE drag result: " + effect);
      if (effect == DragDropEffects.None) throw new Exception("Native file drop was rejected");
    }
  }
}
'@
[NativeFileDrop]::Run($source, $X, $Y)
