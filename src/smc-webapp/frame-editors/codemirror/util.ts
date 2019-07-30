// Don't import other stuff thus making this hard to import.

export function valid_indent(x : any) : number {
  if(typeof(x) != 'number' || isNaN(x) || x <= 1) return 4;
  return x;
}

