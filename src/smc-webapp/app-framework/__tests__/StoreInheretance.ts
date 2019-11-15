class Store<State> {
  private state: State;

  constructor() {}

  getState(): State {
    return this.state;
  }
}

interface TypedMapB<TProps extends Record<string, any>> {
  update<K extends keyof TProps>(updater: (value: TProps[K]) => any): void;
  mergeWith(merger: (key: keyof TProps) => any): void;
}

interface TypedMap<TProps extends Record<string, any>> {
  update<K extends keyof TProps>(updater: (value: TProps[K]) => any): void;
  mergeWith<K extends keyof TProps>(merger: (key: K) => any): void;
}

interface Fruit0 {
  seeds: number;
}
type Fruit = TypedMap<Fruit0>;

interface Tomato0 extends Fruit0 {
  color: "red";
}
type Tomato = TypedMap<Tomato0>;

const FruitStore = new Store<Fruit>();
const TomatoStore = new Store<Tomato>();

const casted = TomatoStore as typeof FruitStore;
