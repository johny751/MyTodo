// Read-only companion to NativeUiDriver. Compile and execute only in Actions.
// No input, process-memory access, arbitrary-message entry point or store writes.
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace D409 {
 public sealed class TimerHistoryGeometry {
  public long Handle, Style, ExtendedStyle, HorizontalExtent;
  public int ClientWidth, ClientHeight, FirstVisibleLine, LineCount;
  public int HorizontalMinimum, HorizontalMaximum, HorizontalPosition;
  public uint HorizontalPage;
  public string ClassName;
 }
 public sealed class TimerHistoryCharacter {
  public int Index, X, Y, Width, Height, ClientWidth, ClientHeight;
  public long PackedPosition;
  public string Character;
  public bool PositionAvailable, PointInsideClient, GlyphInsideClient;
 }
 public static class TimerHistoryProbe {
  [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] private struct SIZE { public int Width,Height; }
  [StructLayout(LayoutKind.Sequential)] private struct SCROLLINFO {
   public uint Size,Mask; public int Minimum,Maximum; public uint Page; public int Position,TrackPosition;
  }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassNameW(IntPtr h,StringBuilder name,int capacity);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtrW(IntPtr h,int index);
  [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr h,out RECT rectangle);
  [DllImport("user32.dll")] private static extern bool GetScrollInfo(IntPtr h,int bar,ref SCROLLINFO info);
  [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr SendMessageTimeoutW(IntPtr h,uint message,IntPtr parameter,IntPtr unused,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr h,IntPtr dc);
  [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc,IntPtr value);
  [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] private static extern bool GetTextExtentPoint32W(IntPtr dc,string text,int count,out SIZE size);

  private static string Class(IntPtr h) {
   var name=new StringBuilder(256);
   if(GetClassNameW(h,name,name.Capacity)==0)throw new InvalidOperationException("History probe HWND unavailable");
   return name.ToString();
  }
  private static long Read(IntPtr h,uint message,int parameter) {
   // All permitted messages only inspect native control state.
   if(message!=0x0193 && message!=0x00CE && message!=0x00BA && message!=0x00D6 && message!=0x000E && message!=0x0031)
    throw new InvalidOperationException("History probe message is not read-only whitelisted");
   UIntPtr value;
   if(SendMessageTimeoutW(h,message,new IntPtr(parameter),IntPtr.Zero,2,2000,out value)==IntPtr.Zero)
    throw new InvalidOperationException("History probe read timeout: "+message);
   return unchecked((long)value.ToUInt64());
  }
  public static TimerHistoryGeometry Describe(long handle) {
   var h=new IntPtr(handle);string name=Class(h);RECT client;
   if(!GetClientRect(h,out client))throw new InvalidOperationException("History probe client unavailable");
   var row=new TimerHistoryGeometry{Handle=handle,ClassName=name,Style=GetWindowLongPtrW(h,-16).ToInt64(),ExtendedStyle=GetWindowLongPtrW(h,-20).ToInt64(),ClientWidth=client.Right-client.Left,ClientHeight=client.Bottom-client.Top,HorizontalExtent=-1,FirstVisibleLine=-1,LineCount=-1};
   if(String.Equals(name,"ListBox",StringComparison.OrdinalIgnoreCase))row.HorizontalExtent=Read(h,0x0193,0);
   else if(String.Equals(name,"Edit",StringComparison.OrdinalIgnoreCase)){row.FirstVisibleLine=(int)Read(h,0x00CE,0);row.LineCount=(int)Read(h,0x00BA,0);}
   else throw new InvalidOperationException("History probe accepts only LISTBOX or EDIT");
   var scroll=new SCROLLINFO();scroll.Size=(uint)Marshal.SizeOf(typeof(SCROLLINFO));scroll.Mask=0x17;
   if(GetScrollInfo(h,0,ref scroll)){row.HorizontalMinimum=scroll.Minimum;row.HorizontalMaximum=scroll.Maximum;row.HorizontalPage=scroll.Page;row.HorizontalPosition=scroll.Position;}
   return row;
  }
  public static TimerHistoryCharacter CharacterPosition(long handle,int index,string character) {
   var h=new IntPtr(handle);
   if(!String.Equals(Class(h),"Edit",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Character measurement requires EDIT");
   long length=Read(h,0x000E,0);
   if(index<0 || index>=length || character==null || character.Length!=1)throw new ArgumentException("Invalid character measurement");
   var geometry=Describe(handle);long packed=Read(h,0x00D6,index);uint low=unchecked((uint)packed);
   var row=new TimerHistoryCharacter{Index=index,Character=character,PackedPosition=packed,PositionAvailable=low!=0xffffffff,X=unchecked((short)(low&0xffff)),Y=unchecked((short)((low>>16)&0xffff)),ClientWidth=geometry.ClientWidth,ClientHeight=geometry.ClientHeight};
   IntPtr dc=GetDC(h);if(dc==IntPtr.Zero)throw new InvalidOperationException("Cannot inspect edit font metrics");
   IntPtr old=IntPtr.Zero;try {
    IntPtr font=new IntPtr(Read(h,0x0031,0));if(font!=IntPtr.Zero)old=SelectObject(dc,font);
    SIZE size;if(!GetTextExtentPoint32W(dc,character,1,out size))throw new InvalidOperationException("Cannot measure edit character");
    row.Width=size.Width;row.Height=size.Height;
   }finally{if(old!=IntPtr.Zero)SelectObject(dc,old);ReleaseDC(h,dc);}
   row.PointInsideClient=row.PositionAvailable&&row.X>=0&&row.Y>=0&&row.X<row.ClientWidth&&row.Y<row.ClientHeight;
   row.GlyphInsideClient=row.PointInsideClient&&row.X+row.Width<=row.ClientWidth&&row.Y+row.Height<=row.ClientHeight;
   return row;
  }
 }
}
