// Mask file paths before printing them or sending to the API.
// Keeps the last 2 segments (the ones with meaning) and hides the rest.
//
//   maskPath("app/pages/admin/users/details/page.tsx")
//     -> ".../details/page.tsx"
//
//   maskPath("components/Button.tsx")
//     -> "components/Button.tsx"  (already short)
//
//   maskPath("")
//     -> ""

export function maskPath(filePath: string): string {
  if (!filePath) return filePath;
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return parts.join('/');
  return `.../${parts.slice(-2).join('/')}`;
}
