let loading: Promise<any> | null = null

export function loadBaiduMap(ak: string): Promise<any> {
  const existing = (window as any).BMap
  if (existing?.Map) return Promise.resolve(existing)
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    const callbackName = `pulseBaiduMapReady_${Date.now()}`
    const timeout = window.setTimeout(() => {
      cleanup()
      loading = null
      reject(new Error('地图服务加载超时，请检查网络后重试'))
    }, 15000)
    const script = document.createElement('script')

    function cleanup() {
      window.clearTimeout(timeout)
      delete (window as any)[callbackName]
      script.onerror = null
    }

    ;(window as any)[callbackName] = () => {
      cleanup()
      const api = (window as any).BMap
      if (api?.Map) resolve(api)
      else {
        loading = null
        reject(new Error('地图服务初始化失败'))
      }
    }
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${encodeURIComponent(ak)}&callback=${callbackName}`
    script.async = true
    script.onerror = () => {
      cleanup()
      loading = null
      reject(new Error('地图服务加载失败，请检查AK和网络'))
    }
    document.head.appendChild(script)
  })

  return loading
}
