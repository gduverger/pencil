// pencil CLI entry point. Commands are added in milestone M3.
export function usage(): string {
  return 'Usage: pencil run <deal.json> [--out <dir>]';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(usage());
}
