export async function selectWorkspaceOption(control, option) {
  const page = control.page();
  const trigger = control.and(page.getByRole('combobox'));
  const name = await trigger.getAttribute('aria-label');
  if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click();
  const popup = page.getByRole('listbox', { name, exact: true });
  if (option.label !== undefined) {
    await popup.getByRole('option', { name: option.label, exact: typeof option.label === 'string' }).click();
  } else {
    await popup.locator(`[role="option"][data-value=${JSON.stringify(option.value)}]`).click();
  }
}
