# Makes Windows EXTEND the desktop onto the Elgato Prompter, so it becomes its
# own screen (not a mirror of your laptop). Reversible any time with Win+P -> Duplicate.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Disp {
  [DllImport("user32.dll")]
  public static extern int SetDisplayConfig(uint n1, IntPtr p1, uint n2, IntPtr p2, uint flags);
  // SDC_APPLY (0x80) | SDC_TOPOLOGY_EXTEND (0x04)
  public static int Extend() { return SetDisplayConfig(0, IntPtr.Zero, 0, IntPtr.Zero, 0x00000080 | 0x00000004); }
}
"@
$r = [Disp]::Extend()
if ($r -eq 0) {
  Write-Host "Prompter is now an extended screen." -ForegroundColor Green
} else {
  Write-Host "Could not auto-extend (code $r). Press Win+P and choose Extend." -ForegroundColor Yellow
}
