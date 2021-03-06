// @flow
import React, { Component } from 'react'

type AppContext = Object // todo
type NextPageContext = Object // todo

export interface Config {
  serializeState?: (any) => any;
  deserializeState?: (any) => any;
  storeKey?: string;
  debug?: boolean;
  overrideIsServer?: boolean;
}

export interface NextJSAppContext extends AppContext {
  ctx: NextPageContext;
}

export interface MakeStoreOptions extends Config, NextPageContext {
  isServer: boolean;
}

export type MakeStore = (initialState: any, options: MakeStoreOptions) => Object

export interface InitStoreOptions {
  initialState?: any;
  ctx?: NextPageContext;
}

export interface WrappedAppProps {
  initialProps: any; // stuff returned from getInitialProps
  initialState: any; // stuff in the Store state after getInitialProps
  isServer: boolean;
}

export interface AppProps {
  store: Object;
}

const defaultConfig: Config = {
  storeKey: '__NEXT_REDUX_STORE__',
  debug: false,
  serializeState: (state) => state,
  deserializeState: (state) => state,
}

export default (makeStore: MakeStore, createApis: Function, config?: Config) => {
  config = {
    ...defaultConfig,
    ...config,
  }

  const isServer = typeof window === 'undefined'

  const initStore = ({ initialState, ctx }: InitStoreOptions): Object => {
    const { storeKey } = config

    const createStore = () =>
      makeStore(
        config.deserializeState(initialState),
        {
          ...ctx,
          ...config,
          isServer,
        },
        ctx.apis,
        ctx.rootEpic,
      )

    if (isServer) {
      return createStore()
    }

    // Memoize store if client
    if (!(storeKey in window)) {
      window[storeKey] = createStore()
    }

    return window[storeKey]
  }

  return (App: any) =>
    class WrappedApp extends Component<WrappedAppProps> {
      /* istanbul ignore next */
      static displayName = `withRedux(${App.displayName || App.name || 'App'})`

      static getInitialProps = async (appCtx: NextJSAppContext) => {
        /* istanbul ignore next */
        if (!appCtx) throw new Error('No app context')
        /* istanbul ignore next */
        if (!appCtx.ctx) throw new Error('No page context')

        const [apis, rootEpic] = createApis()
        appCtx.ctx.apis = apis
        appCtx.ctx.rootEpic = rootEpic

        const store = initStore({
          ctx: appCtx.ctx,
        })

        if (config.debug)
          console.info('1. WrappedApp.getInitialProps wrapper got the store with state', store.getState())

        appCtx.ctx.store = store
        appCtx.ctx.isServer = isServer

        let initialProps = {}

        if ('getInitialProps' in App) {
          initialProps = await App.getInitialProps.call(App, appCtx)
        }

        if (config.debug) console.info('3. WrappedApp.getInitialProps has store state', store.getState())

        return {
          isServer,
          initialState: isServer ? config.serializeState(store.getState()) : store.getState(),
          initialProps,
        }
      }

      constructor(props, context) {
        super(props, context)

        const { initialState } = props

        if (config.debug)
          console.info('4. WrappedApp.render created new store with initialState', initialState, isServer)

        let StackdriverConfig = false
        if (props.initialProps && props.initialProps.pageProps) {
          // eslint-disable-next-line prefer-destructuring
          StackdriverConfig = props.initialProps.pageProps.StackdriverConfig
        }
        const [apis, rootEpic] = createApis(StackdriverConfig)
        this.apis = apis

        this.store = initStore({
          initialState,
          ctx: { rootEpic, apis },
        })
      }

      store: Object
      apis: Object

      render() {
        const { initialProps, ...props } = this.props

        // Cmp render must return something like <Provider><Component/></Provider>
        return <App {...props} {...initialProps} setToken={this.apis.setToken} store={this.store} />
      }
    }
}
