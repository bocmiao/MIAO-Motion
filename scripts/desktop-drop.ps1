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
    var app = Process.GetProcessesByName("miao-motion")[0];
    ShowWindow(app.MainWindowHandle, 9);
    var point = new Point { X = x, Y = y };
    if (!ClientToScreen(app.MainWindowHandle, ref point)) throw new Exception("ClientToScreen failed");
    SetForegroundWindow(app.MainWindowHandle);
    var form = new Form { Text = "CI file drag source", StartPosition = FormStartPosition.Manual, Location = new System.Drawing.Point(0,0), Size = new Size(140,100), TopMost = true };
    DragDropEffects effect = DragDropEffects.None;
    bool pressed = false;
    var deadline = new System.Windows.Forms.Timer { Interval = 20000 };
    deadline.Tick += (sender, args) => { deadline.Stop(); mouse_event(4,0,0,0,UIntPtr.Zero); form.Close(); };
    form.MouseDown += (sender, args) => {
      pressed = true;
      Console.WriteLine("Native drag source received mouse down");
      var data = new DataObject(DataFormats.FileDrop, new string[] { path });
      effect = form.DoDragDrop(data, DragDropEffects.Copy);
      Console.WriteLine("Native drag result: " + effect);
      form.Close();
    };
    form.Shown += (sender, args) => {
      // Override the hidden startup hint inherited from the PowerShell helper.
      ShowWindow(form.Handle, 5);
      form.Activate();
      SetForegroundWindow(form.Handle);
      var start = form.PointToScreen(new System.Drawing.Point(form.ClientSize.Width / 2, form.ClientSize.Height / 2));
      Console.WriteLine("Native drag coordinates: " + start + " -> " + point.X + "," + point.Y);
      deadline.Start();
      new Thread(() => {
        Thread.Sleep(1000);
        var bounds = SystemInformation.VirtualScreen;
        using (var bitmap = new Bitmap(bounds.Width, bounds.Height)) {
          using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(bounds.Location, System.Drawing.Point.Empty, bounds.Size);
          bitmap.Save("test-results/desktop-camera-drag-desktop.png");
        }
        SetCursorPos(start.X,start.Y); mouse_event(2,0,0,0,UIntPtr.Zero);
        Thread.Sleep(300);
        for(int i=1;i<=20;i++) { SetCursorPos(start.X+(point.X-start.X)*i/20,start.Y+(point.Y-start.Y)*i/20); Thread.Sleep(40); }
        Thread.Sleep(400); mouse_event(4,0,0,0,UIntPtr.Zero);
      }) { IsBackground = true }.Start();
    };
    Application.Run(form);
    deadline.Dispose();
    if (!pressed) throw new Exception("Native drag source did not receive mouse down");
    if (effect == DragDropEffects.None) throw new Exception("Native file drop was rejected");
  }
}
'@
[NativeFileDrop]::Run($source, $X, $Y)
