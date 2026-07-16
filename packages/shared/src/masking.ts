export function maskPan(pan: string): string {
  return pan.replace(/^.{5}(.{4}).$/, "XXXXX$1X");
}

export function maskBankAccount(accountNumber: string): string {
  return accountNumber.replace(/.(?=.{4})/g, "X");
}
