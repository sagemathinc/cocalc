interface CodemirrorPosition {
  line: number;
  ch: number;
}

interface CodemirrorRange {
  from: CodemirrorPosition;
  to: CodemirrorPosition;
}

export type Position = CodemirrorRange;

export interface Mark {
  id: string;
  pos: Position;
  done?: boolean;
}
