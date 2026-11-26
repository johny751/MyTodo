// External Win32 UI driver. Compiled only by reproduce-ui.ps1 on GitHub Actions.
// No product source is linked, injected, or modified.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace D408
{
    public sealed class WindowInfo
    {
        public long Handle { get; set; }
        public long Parent { get; set; }
        public int ProcessId { get; set; }
        public int ControlId { get; set; }
        public string ClassName { get; set; }
        public string Text { get; set; }
        public bool Visible { get; set; }
        public bool Enabled { get; set; }
        public int Left { get; set; }
        public int Top { get; set; }
        public int Right { get; set; }
        public int Bottom { get; set; }
    }

    public static class UiDriver
    {
        private delegate bool EnumProc(IntPtr hwnd, IntPtr value);
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] private struct GUITHREADINFO
        {
            public uint Size, Flags;
            public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
            public RECT CaretRect;
        }
        [StructLayout(LayoutKind.Sequential)] private struct COMBOBOXINFO
        {
            public int Size;
            public RECT Item, Button;
            public uint ButtonState;
            public IntPtr Combo, Edit, List;
        }
        [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint Type; public INPUTUNION Data; }
        [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION
        {
            [FieldOffset(0)] public MOUSEINPUT Mouse;
            [FieldOffset(0)] public KEYBDINPUT Keyboard;
        }
        [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT
        { public int X, Y; public uint MouseData, Flags, Time; public UIntPtr Extra; }
        [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT
        { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }

        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr value);
        [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr value);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassNameW(IntPtr hwnd, StringBuilder text, int size);
        [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeoutW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "SendMessageTimeoutW")]
        private static extern IntPtr SendTextMessage(IntPtr hwnd, uint message, IntPtr wParam, string text, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "SendMessageTimeoutW")]
        private static extern IntPtr ReadTextMessage(IntPtr hwnd, uint message, IntPtr wParam, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessageW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] private static extern IntPtr SetFocus(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint first, uint second, bool attach);
        [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
        [DllImport("user32.dll")] private static extern bool GetComboBoxInfo(IntPtr combo, ref COMBOBOXINFO info);
        [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);

        public static string Text(long handle)
        {
            StringBuilder value = new StringBuilder(131072); UIntPtr result;
            if (ReadTextMessage(new IntPtr(handle), 0x000D, new IntPtr(value.Capacity), value, 2, 1500, out result) == IntPtr.Zero)
                throw new InvalidOperationException("WM_GETTEXT timed out: " + handle);
            return value.ToString();
        }
        public static long Message(long handle, uint message, long wParam, long lParam)
        {
            UIntPtr result;
            if (SendMessageTimeoutW(new IntPtr(handle), message, new IntPtr(wParam), new IntPtr(lParam), 2, 2000, out result) == IntPtr.Zero)
                throw new InvalidOperationException("Win32 message timed out: " + message);
            return unchecked((long)result.ToUInt64());
        }
        public static void SetText(long handle, string text)
        {
            UIntPtr result;
            if (SendTextMessage(new IntPtr(handle), 0x000C, IntPtr.Zero, text, 2, 2000, out result) == IntPtr.Zero || result == UIntPtr.Zero)
                throw new InvalidOperationException("WM_SETTEXT failed: " + handle);
        }
        public static void Click(long handle)
        {
            if (!IsWindowVisible(new IntPtr(handle)) || !IsWindowEnabled(new IntPtr(handle)))
                throw new InvalidOperationException("Control is hidden or disabled: " + handle);
            if (!PostMessageW(new IntPtr(handle), 0x00F5, IntPtr.Zero, IntPtr.Zero))
                throw new InvalidOperationException("BM_CLICK failed: " + handle);
        }
        public static void Close(long handle)
        { PostMessageW(new IntPtr(handle), 0x0010, IntPtr.Zero, IntPtr.Zero); }
        public static long ComboEdit(long handle)
        {
            COMBOBOXINFO info = new COMBOBOXINFO(); info.Size = Marshal.SizeOf(typeof(COMBOBOXINFO));
            if (!GetComboBoxInfo(new IntPtr(handle), ref info)) throw new InvalidOperationException("Not a native combo box: " + handle);
            return info.Edit.ToInt64();
        }
        public static long Focus(long handle)
        {
            IntPtr hwnd = new IntPtr(handle); uint processId;
            uint targetThread = GetWindowThreadProcessId(hwnd, out processId), caller = GetCurrentThreadId();
            IntPtr root = GetAncestor(hwnd, 2);
            ShowWindow(root, 9); SetForegroundWindow(root);
            bool attached = caller != targetThread && AttachThreadInput(caller, targetThread, true);
            try { SetForegroundWindow(root); SetFocus(hwnd); }
            finally { if (attached) AttachThreadInput(caller, targetThread, false); }
            Thread.Sleep(100);
            GUITHREADINFO info = new GUITHREADINFO(); info.Size = (uint)Marshal.SizeOf(typeof(GUITHREADINFO));
            if (!GetGUIThreadInfo(targetThread, ref info)) throw new InvalidOperationException("Cannot read target keyboard focus");
            return info.Focus.ToInt64();
        }
        private static INPUT Key(ushort key, bool up)
        {
            INPUT input = new INPUT(); input.Type = 1;
            input.Data.Keyboard.Key = key; input.Data.Keyboard.Flags = up ? 2u : 0u;
            return input;
        }
        public static void Chord(ushort key, bool control, bool shift)
        {
            List<INPUT> values = new List<INPUT>();
            if (control) values.Add(Key(0x11, false));
            if (shift) values.Add(Key(0x10, false));
            values.Add(Key(key, false)); values.Add(Key(key, true));
            if (shift) values.Add(Key(0x10, true));
            if (control) values.Add(Key(0x11, true));
            INPUT[] inputs = values.ToArray();
            if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length)
                throw new InvalidOperationException("SendInput did not inject the complete keyboard chord");
        }
        public static void TypeText(string text)
        {
            foreach (char character in text)
            {
                INPUT down = new INPUT(); down.Type = 1; down.Data.Keyboard.Scan = character; down.Data.Keyboard.Flags = 4;
                INPUT up = down; up.Data.Keyboard.Flags = 6;
                INPUT[] pair = { down, up };
                if (SendInput(2, pair, Marshal.SizeOf(typeof(INPUT))) != 2)
                    throw new InvalidOperationException("SendInput failed while typing");
            }
        }
        private static WindowInfo Describe(IntPtr hwnd)
        {
            uint processId; GetWindowThreadProcessId(hwnd, out processId);
            StringBuilder cls = new StringBuilder(256); GetClassNameW(hwnd, cls, cls.Capacity);
            RECT r; GetWindowRect(hwnd, out r);
            string text;
            try { text = Text(hwnd.ToInt64()); } catch { text = "<WM_GETTEXT timeout>"; }
            return new WindowInfo { Handle = hwnd.ToInt64(), Parent = GetParent(hwnd).ToInt64(), ProcessId = (int)processId,
                ControlId = GetDlgCtrlID(hwnd), ClassName = cls.ToString(), Text = text,
                Visible = IsWindowVisible(hwnd), Enabled = IsWindowEnabled(hwnd),
                Left = r.Left, Top = r.Top, Right = r.Right, Bottom = r.Bottom };
        }
        public static WindowInfo[] Snapshot(int processId)
        {
            List<WindowInfo> result = new List<WindowInfo>(); HashSet<long> seen = new HashSet<long>();
            EnumWindows(delegate(IntPtr hwnd, IntPtr value) {
                uint owner; GetWindowThreadProcessId(hwnd, out owner);
                if (owner == processId)
                {
                    if (seen.Add(hwnd.ToInt64())) result.Add(Describe(hwnd));
                    EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr data) {
                        if (seen.Add(child.ToInt64())) result.Add(Describe(child)); return true;
                    }, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
            return result.ToArray();
        }
    }
}
