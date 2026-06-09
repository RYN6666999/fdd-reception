const STATES = ['loading', 'invalid', 'capture', 'confirm', 'done', 'error']

export class AppState {
  #state = 'loading'
  #data = {}
  #listeners = []

  get state() { return this.#state }
  get data() { return { ...this.#data } }

  transition(newState, data = {}) {
    if (!STATES.includes(newState)) throw new Error(`Invalid state: ${newState}`)
    this.#state = newState
    this.#data = { ...this.#data, ...data }
    this.#listeners.forEach(fn => fn(this.#state, this.#data))
  }

  on(fn) {
    this.#listeners.push(fn)
    return () => { this.#listeners = this.#listeners.filter(f => f !== fn) }
  }
}
