export type CutoverInput = {
  hostname: string;
  oldContent: string;
  newContent: string;
  ttl: number;
};

export type CutoverPlan = {
  hostname: string;
  ttl: number;
  forward: string;
  rollback: string;
};

export function planCutover(input: CutoverInput): CutoverPlan {
  if (input.ttl < 60 || input.ttl > 3600) {
    throw new Error("ttl must be between 60 and 3600 seconds");
  }
  if (input.oldContent === input.newContent) {
    throw new Error("new content must differ from the current record");
  }
  return {
    hostname: input.hostname,
    ttl: input.ttl,
    forward: input.newContent,
    rollback: input.oldContent,
  };
}
