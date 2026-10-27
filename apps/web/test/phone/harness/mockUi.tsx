export async function showConfirm(_o: unknown): Promise<{ confirmed: boolean; checked?: boolean }> {
  (window as unknown as { __confirm?: unknown }).__confirm = _o;
  return { confirmed: true, checked: false };
}
