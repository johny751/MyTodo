// Independent external driver. Compile and execute only in GitHub Actions.
// Mouse and keyboard mutations use SendInput. Window management/focus APIs are
// separately identified in the trace; no product code or remote-memory injection.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace D409 {
 public sealed class WindowInfo {
  public long Handle, Parent, Root; public int ProcessId, ControlId;
  public string ClassName, Text; public bool Visible, Enabled;
  public int Left, Top, Right, Bottom; public uint ActualWindowDpi;
 }
 public sealed class InputRecord {
  public string AtUtc, Method, Action, Text; public long Target, Hit, Focus;
  public int X,Y,ClientX,ClientY,Requested,Injected; public WindowInfo TargetInfo, HitInfo;
 }
 public sealed class DesktopInfo {
  public int Left,Top,Width,Height,WorkLeft,WorkTop,WorkRight,WorkBottom;
  public int RequestedWidth,RequestedHeight,ModeResult; public string Method;
 }
 public static class NativeUiDriver {
  private delegate bool EnumProc(IntPtr hwnd,IntPtr value);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; public POINT(int x,int y){X=x;Y=y;} }
  [StructLayout(LayoutKind.Sequential)] private struct GUITHREADINFO {
   public uint Size,Flags; public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret; public RECT CaretRect;
  }
  [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint Type;public INPUTUNION Data; }
  [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION {
   [FieldOffset(0)]public MOUSEINPUT Mouse;[FieldOffset(0)]public KEYBDINPUT Keyboard;
  }
  [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT {public int X,Y;public uint MouseData,Flags,Time;public UIntPtr Extra;}
  [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT {public ushort Key,Scan;public uint Flags,Time;public UIntPtr Extra;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct DEVMODE {
   [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string DeviceName;
   public ushort SpecVersion,DriverVersion,Size,DriverExtra;public uint Fields;
   public int PositionX,PositionY;public uint DisplayOrientation,DisplayFixedOutput;
   public short Color,Duplex,YResolution,TTOption,Collate;
   [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string FormName;
   public ushort LogPixels;public uint BitsPerPel,PelsWidth,PelsHeight,DisplayFlags,DisplayFrequency,ICMMethod,ICMIntent,MediaType,DitherType,Reserved1,Reserved2,PanningWidth,PanningHeight;
  }
  private static readonly List<InputRecord> trace=new List<InputRecord>();
  private static DEVMODE originalMode; private static bool changedMode; private static IntPtr originalAwareness;
  [DllImport("user32.dll")]private static extern bool EnumWindows(EnumProc proc,IntPtr data);
  [DllImport("user32.dll")]private static extern bool EnumChildWindows(IntPtr parent,EnumProc proc,IntPtr data);
  [DllImport("user32.dll")]private static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]private static extern int GetClassNameW(IntPtr hwnd,StringBuilder text,int size);
  [DllImport("user32.dll")]private static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern IntPtr GetAncestor(IntPtr hwnd,uint flag);
  [DllImport("user32.dll")]private static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern bool IsChild(IntPtr parent,IntPtr child);
  [DllImport("user32.dll")]private static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")]private static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")]private static extern bool ClientToScreen(IntPtr hwnd,ref POINT point);
  [DllImport("user32.dll")]private static extern bool ScreenToClient(IntPtr hwnd,ref POINT point);
  [DllImport("user32.dll")]private static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")]private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]private static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")]private static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")]private static extern IntPtr SetFocus(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern bool AttachThreadInput(uint first,uint second,bool attach);
  [DllImport("kernel32.dll")]private static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]private static extern bool GetGUIThreadInfo(uint thread,ref GUITHREADINFO info);
  [DllImport("user32.dll")]private static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
  [DllImport("user32.dll")]private static extern int GetAwarenessFromDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll",SetLastError=true)]private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")]private static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")]private static extern bool SystemParametersInfoW(uint action,uint parameter,out RECT rect,uint update);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]private static extern bool EnumDisplaySettingsW(string device,int mode,ref DEVMODE data);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]private static extern int ChangeDisplaySettingsW(ref DEVMODE mode,uint flags);
  [DllImport("user32.dll",SetLastError=true)]private static extern uint SendInput(uint count,INPUT[] values,int size);
  [DllImport("user32.dll",SetLastError=true)]private static extern IntPtr SendMessageTimeoutW(IntPtr hwnd,uint msg,IntPtr wp,IntPtr lp,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW",SetLastError=true)]private static extern IntPtr ReadTextMessage(IntPtr hwnd,uint msg,IntPtr wp,StringBuilder text,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",SetLastError=true)]private static extern IntPtr ReadRectMessage(IntPtr hwnd,uint msg,IntPtr wp,out RECT rect,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",SetLastError=true)]private static extern IntPtr ReadSelectionMessage(IntPtr hwnd,uint msg,out int first,out int last,uint flags,uint timeout,out UIntPtr result);

  public static string Text(long hwnd){return ReadText(hwnd,0x000D,131072,131072);}
  private static string ReadText(long hwnd,uint msg,int parameter,int capacity){
   var value=new StringBuilder(capacity);UIntPtr result;
   if(ReadTextMessage(new IntPtr(hwnd),msg,new IntPtr(parameter),value,2,2000,out result)==IntPtr.Zero)throw new InvalidOperationException("Text read timeout: "+hwnd+" msg="+msg);
   return value.ToString();
  }
  public static long ReadNumber(long hwnd,uint msg,int parameter){
   // Only explicitly reviewed system read messages. No mutable arbitrary-message API.
   if(msg!=0x018B&&msg!=0x0188&&msg!=0x018E&&msg!=0x0146&&msg!=0x0147&&msg!=0x018A&&msg!=0x0149&&msg!=0x00CE&&msg!=0x1004)throw new InvalidOperationException("Unapproved read message");
   UIntPtr result;if(SendMessageTimeoutW(new IntPtr(hwnd),msg,new IntPtr(parameter),IntPtr.Zero,2,2000,out result)==IntPtr.Zero)throw new InvalidOperationException("Read timeout");
   return unchecked((long)result.ToUInt64());
  }
  public static string ListText(long hwnd,int index){long size=ReadNumber(hwnd,0x018A,index);if(size<0||size>131070)throw new InvalidOperationException("Invalid list string length");return ReadText(hwnd,0x0189,index,(int)size+2);}
  public static string ComboText(long hwnd,int index){long size=ReadNumber(hwnd,0x0149,index);if(size<0||size>131070)throw new InvalidOperationException("Invalid combo string length");return ReadText(hwnd,0x0148,index,(int)size+2);}
  public static int[] Selection(long hwnd){int a,b;UIntPtr result;if(ReadSelectionMessage(new IntPtr(hwnd),0x00B0,out a,out b,2,2000,out result)==IntPtr.Zero)throw new InvalidOperationException("EM_GETSEL timeout");return new int[]{a,b};}
  public static RECT Client(long hwnd){RECT r;if(!GetClientRect(new IntPtr(hwnd),out r))throw new InvalidOperationException("Client rect unavailable");var p=new POINT(0,0);if(!ClientToScreen(new IntPtr(hwnd),ref p))throw new InvalidOperationException("Client origin unavailable");r.Left+=p.X;r.Right+=p.X;r.Top+=p.Y;r.Bottom+=p.Y;return r;}
  public static WindowInfo Describe(long handle){IntPtr hwnd=new IntPtr(handle);uint pid;GetWindowThreadProcessId(hwnd,out pid);var cls=new StringBuilder(256);GetClassNameW(hwnd,cls,cls.Capacity);RECT r;if(!GetWindowRect(hwnd,out r))throw new InvalidOperationException("Window no longer exists: "+handle);
   return new WindowInfo{Handle=handle,Parent=GetParent(hwnd).ToInt64(),Root=GetAncestor(hwnd,2).ToInt64(),ProcessId=(int)pid,ControlId=GetDlgCtrlID(hwnd),ClassName=cls.ToString(),Text=Text(handle),Visible=IsWindowVisible(hwnd),Enabled=IsWindowEnabled(hwnd),Left=r.Left,Top=r.Top,Right=r.Right,Bottom=r.Bottom,ActualWindowDpi=GetDpiForWindow(hwnd)};
  }
  public static WindowInfo[] Snapshot(int processId){var rows=new List<WindowInfo>();var seen=new HashSet<long>();EnumWindows(delegate(IntPtr hwnd,IntPtr data){uint pid;GetWindowThreadProcessId(hwnd,out pid);if(pid==processId){if(seen.Add(hwnd.ToInt64()))rows.Add(Describe(hwnd.ToInt64()));EnumChildWindows(hwnd,delegate(IntPtr child,IntPtr unused){if(seen.Add(child.ToInt64()))rows.Add(Describe(child.ToInt64()));return true;},IntPtr.Zero);}return true;},IntPtr.Zero);return rows.ToArray();}
  public static int Awareness(long handle){return GetAwarenessFromDpiAwarenessContext(GetWindowDpiAwarenessContext(new IntPtr(handle)));}
  public static string UsePhysicalCoordinates(){originalAwareness=SetThreadDpiAwarenessContext(new IntPtr(-4));if(originalAwareness==IntPtr.Zero)throw new InvalidOperationException("Cannot enable physical-coordinate driver thread awareness");return "Driver thread per-monitor-v2 coordinates; product OS DPI observed separately";}
  public static void RestoreCoordinateContext(){if(originalAwareness!=IntPtr.Zero){SetThreadDpiAwarenessContext(originalAwareness);originalAwareness=IntPtr.Zero;}}
  public static long Focused(long handle){uint pid;uint thread=GetWindowThreadProcessId(new IntPtr(handle),out pid);var info=new GUITHREADINFO();info.Size=(uint)Marshal.SizeOf(typeof(GUITHREADINFO));if(!GetGUIThreadInfo(thread,ref info))throw new InvalidOperationException("Cannot read native focus");return info.Focus.ToInt64();}
  private static long FocusAfter(long target){try{return target==0?0:Focused(target);}catch{return -1;}}
  private static void Record(string method,string action,long target,string text){trace.Add(new InputRecord{AtUtc=DateTime.UtcNow.ToString("o"),Method=method,Action=action,Target=target,Text=text,Focus=FocusAfter(target)});}
  public static InputRecord[] DrainTrace(){var rows=trace.ToArray();trace.Clear();return rows;}
  public static void Activate(long handle){IntPtr hwnd=new IntPtr(handle),root=GetAncestor(hwnd,2);if(IsIconic(root))ShowWindow(root,9);uint pid;uint thread=GetWindowThreadProcessId(root,out pid),caller=GetCurrentThreadId();bool attached=caller!=thread&&AttachThreadInput(caller,thread,true);try{SetForegroundWindow(root);}finally{if(attached)AttachThreadInput(caller,thread,false);}for(int i=0;i<20&&GetForegroundWindow()!=root;i++)Thread.Sleep(30);if(GetForegroundWindow()!=root)throw new InvalidOperationException("Foreground activation failed: "+root);Record("Win32 foreground API","activate",handle,"");}
  public static void Focus(long handle){Activate(handle);var info=Describe(handle);if(!info.Visible||!info.Enabled)throw new InvalidOperationException("Cannot focus hidden/disabled control");uint pid;uint thread=GetWindowThreadProcessId(new IntPtr(handle),out pid),caller=GetCurrentThreadId();bool attached=caller!=thread&&AttachThreadInput(caller,thread,true);try{SetFocus(new IntPtr(handle));}finally{if(attached)AttachThreadInput(caller,thread,false);}Thread.Sleep(80);if(Focused(handle)!=handle)throw new InvalidOperationException("Native focus mismatch");Record("Win32 SetFocus API (not keyboard traversal)","focus",handle,"");}
  public static DesktopInfo Desktop(){RECT work;if(!SystemParametersInfoW(0x30,0,out work,0))throw new InvalidOperationException("Work area unavailable");return new DesktopInfo{Left=GetSystemMetrics(76),Top=GetSystemMetrics(77),Width=GetSystemMetrics(78),Height=GetSystemMetrics(79),WorkLeft=work.Left,WorkTop=work.Top,WorkRight=work.Right,WorkBottom=work.Bottom,Method="GetSystemMetrics and SPI_GETWORKAREA"};}
  public static DesktopInfo EnsureDesktop(int width,int height){var current=Desktop();if(current.Width>=width&&current.Height>=height)return current;DEVMODE best=new DEVMODE();long area=long.MaxValue;for(int i=0;;i++){var mode=new DEVMODE();mode.Size=(ushort)Marshal.SizeOf(typeof(DEVMODE));if(!EnumDisplaySettingsW(null,i,ref mode))break;if(mode.PelsWidth>=width&&mode.PelsHeight>=height&&mode.BitsPerPel>=32&&(long)mode.PelsWidth*mode.PelsHeight<area){best=mode;area=(long)mode.PelsWidth*mode.PelsHeight;}}if(area==long.MaxValue){current.RequestedWidth=width;current.RequestedHeight=height;current.ModeResult=-2;current.Method="No larger enumerated mode; test actual current desktop and native minimum bounds";return current;}originalMode=new DEVMODE();originalMode.Size=(ushort)Marshal.SizeOf(typeof(DEVMODE));if(!EnumDisplaySettingsW(null,-1,ref originalMode))throw new InvalidOperationException("Cannot preserve original display mode");int result=ChangeDisplaySettingsW(ref best,0);changedMode=result==0;Thread.Sleep(250);var after=Desktop();after.RequestedWidth=width;after.RequestedHeight=height;after.ModeResult=result;after.Method="EnumDisplaySettingsW + temporary ChangeDisplaySettingsW (no registry write)";return after;}
  public static DesktopInfo RestoreDesktop(){if(changedMode){int result=ChangeDisplaySettingsW(ref originalMode,0);changedMode=false;if(result!=0)throw new InvalidOperationException("Original display mode restoration failed: "+result);}return Desktop();}
  public static void Fit(long handle,int desiredWidth,int desiredHeight){var d=Desktop();int width=Math.Min(desiredWidth,d.WorkRight-d.WorkLeft-16),height=Math.Min(desiredHeight,d.WorkBottom-d.WorkTop-16);Activate(handle);if(!SetWindowPos(new IntPtr(handle),IntPtr.Zero,d.WorkLeft+8,d.WorkTop+8,width,height,0x0004))throw new InvalidOperationException("Fit SetWindowPos failed");Record("Win32 SetWindowPos API","fit-to-actual-workarea",handle,width+"x"+height);Thread.Sleep(120);}
  public static void Resize(long handle,int width,int height){Activate(handle);if(!SetWindowPos(new IntPtr(handle),IntPtr.Zero,20,20,width,height,0x0004))throw new InvalidOperationException("SetWindowPos failed");Record("Win32 SetWindowPos API","resize",handle,width+"x"+height);Thread.Sleep(120);}
  public static void WindowState(long handle,int command){Activate(handle);ShowWindow(new IntPtr(handle),command);Record("Win32 ShowWindow API","window-state",handle,command.ToString());Thread.Sleep(120);}
  public static WindowInfo CheckPoint(long handle,int x,int y){var target=Describe(handle);if(!target.Visible||!target.Enabled)throw new InvalidOperationException("Target hidden/disabled: "+target.ControlId);var desktop=Desktop();if(x<desktop.Left||y<desktop.Top||x>=desktop.Left+desktop.Width||y>=desktop.Top+desktop.Height)throw new InvalidOperationException("Input point outside actual desktop");if(x<target.Left||x>=target.Right||y<target.Top||y>=target.Bottom)throw new InvalidOperationException("Input point outside control");IntPtr hit=WindowFromPoint(new POINT(x,y));if(hit!=new IntPtr(handle)&&!IsChild(new IntPtr(handle),hit))throw new InvalidOperationException("Input occluded: target="+handle+" hit="+hit+" x="+x+" y="+y);var hitInfo=Describe(hit.ToInt64());if(hitInfo.ProcessId!=target.ProcessId)throw new InvalidOperationException("Hit belongs to another process");return hitInfo;}
  private static INPUT Mouse(int x,int y,uint flags,uint data){var d=Desktop();var value=new INPUT();value.Type=0;value.Data.Mouse.X=(int)Math.Round((x-d.Left)*65535.0/Math.Max(1,d.Width-1));value.Data.Mouse.Y=(int)Math.Round((y-d.Top)*65535.0/Math.Max(1,d.Height-1));value.Data.Mouse.Flags=flags;value.Data.Mouse.MouseData=data;return value;}
  private static int Inject(INPUT[] values){uint count=SendInput((uint)values.Length,values,Marshal.SizeOf(typeof(INPUT)));if(count!=values.Length)throw new InvalidOperationException("Incomplete SendInput: "+count+" / "+values.Length+" win32="+Marshal.GetLastWin32Error());return (int)count;}
  private static InputRecord TracePoint(string action,long handle,int x,int y,WindowInfo hit,int count){var p=new POINT(x,y);ScreenToClient(new IntPtr(handle),ref p);var row=new InputRecord{AtUtc=DateTime.UtcNow.ToString("o"),Method="SendInput mouse with WindowFromPoint",Action=action,Target=handle,TargetInfo=Describe(handle),Hit=hit.Handle,HitInfo=hit,X=x,Y=y,ClientX=p.X,ClientY=p.Y,Requested=count,Injected=0,Focus=Focused(handle)};trace.Add(row);return row;}
  public static void ClickAt(long handle,int x,int y,bool twice){Activate(handle);var hit=CheckPoint(handle,x,y);var row=TracePoint(twice?"double-click":"click",handle,x,y,hit,twice?5:3);row.Injected+=Inject(new INPUT[]{Mouse(x,y,0xC001,0)});Thread.Sleep(40);for(int i=0;i<(twice?2:1);i++){row.Injected+=Inject(new INPUT[]{Mouse(x,y,2,0),Mouse(x,y,4,0)});if(twice&&i==0)Thread.Sleep(75);}Thread.Sleep(80);}
  public static void Click(long handle){var r=Describe(handle);ClickAt(handle,(r.Left+r.Right)/2,(r.Top+r.Bottom)/2,false);}
  public static void ListItem(long handle,int index,bool twice){Activate(handle);RECT r;UIntPtr value;if(ReadRectMessage(new IntPtr(handle),0x0198,new IntPtr(index),out r,2,2000,out value)==IntPtr.Zero||unchecked((long)value.ToUInt64())<0)throw new InvalidOperationException("List row rect unavailable");var p=new POINT((r.Left+r.Right)/2,(r.Top+r.Bottom)/2);ClientToScreen(new IntPtr(handle),ref p);ClickAt(handle,p.X,p.Y,twice);}
  public static void Drag(long source,int sx,int sy,long destination,int dx,int dy){Activate(source);var hit=CheckPoint(source,sx,sy);CheckPoint(destination,dx,dy);var row=TracePoint("drag-start",source,sx,sy,hit,23);row.Injected+=Inject(new INPUT[]{Mouse(sx,sy,0xC001,0),Mouse(sx,sy,2,0)});try{for(int i=1;i<=20;i++){int x=sx+(dx-sx)*i/20,y=sy+(dy-sy)*i/20;row.Injected+=Inject(new INPUT[]{Mouse(x,y,0xC001,0)});Thread.Sleep(25);}}finally{row.Injected+=Inject(new INPUT[]{Mouse(dx,dy,4,0)});}Record("SendInput mouse","drag-end",destination,dx+","+dy);Thread.Sleep(150);}
  public static void Wheel(long handle,int delta){Activate(handle);var r=Describe(handle);int x=(r.Left+r.Right)/2,y=(r.Top+r.Bottom)/2;var hit=CheckPoint(handle,x,y);var row=TracePoint("wheel",handle,x,y,hit,2);row.Injected=Inject(new INPUT[]{Mouse(x,y,0xC001,0),Mouse(x,y,0x800,unchecked((uint)delta))});Thread.Sleep(80);}
  private static INPUT Key(ushort key,bool up){var value=new INPUT();value.Type=1;value.Data.Keyboard.Key=key;value.Data.Keyboard.Flags=up?2u:0;return value;}
  public static void ReleaseKeys(){Inject(new INPUT[]{Key(0x11,true),Key(0x10,true),Key(0x12,true)});}
  public static void Chord(long expectedFocus,ushort key,bool control,bool shift,bool alt){if(expectedFocus!=0&&Focused(expectedFocus)!=expectedFocus)throw new InvalidOperationException("Key sent to wrong focus");var values=new List<INPUT>();if(control)values.Add(Key(0x11,false));if(shift)values.Add(Key(0x10,false));if(alt)values.Add(Key(0x12,false));values.Add(Key(key,false));values.Add(Key(key,true));if(alt)values.Add(Key(0x12,true));if(shift)values.Add(Key(0x10,true));if(control)values.Add(Key(0x11,true));var row=new InputRecord{AtUtc=DateTime.UtcNow.ToString("o"),Method="SendInput keyboard",Action="chord",Target=expectedFocus,Focus=FocusAfter(expectedFocus),Text="key="+key+" ctrl="+control+" shift="+shift+" alt="+alt,Requested=values.Count,Injected=0};trace.Add(row);try{row.Injected=Inject(values.ToArray());}finally{ReleaseKeys();}Thread.Sleep(70);}
  public static void TypeText(long expectedFocus,string text){if(Focused(expectedFocus)!=expectedFocus)throw new InvalidOperationException("Typing focus mismatch");int requested=0;foreach(char c in text)if(c!='\r'&&c!='\n')requested+=2;var row=new InputRecord{AtUtc=DateTime.UtcNow.ToString("o"),Method="SendInput Unicode (not IME composition); newline has separate key trace",Action="type",Target=expectedFocus,Focus=Focused(expectedFocus),Text=text,Requested=requested,Injected=0};trace.Add(row);foreach(char character in text){if(character=='\r')continue;if(character=='\n'){Chord(expectedFocus,13,false,false,false);continue;}var down=new INPUT();down.Type=1;down.Data.Keyboard.Scan=character;down.Data.Keyboard.Flags=4;var up=down;up.Data.Keyboard.Flags=6;row.Injected+=Inject(new INPUT[]{down,up});}Thread.Sleep(80);}
 }
}
