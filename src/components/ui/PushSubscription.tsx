import { useState } from 'react'
import { Button } from '.'
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSubscribed } from '@/lib/pushNotifications'
import { toast } from '@/lib/toast'
import { Bell, BellOff } from 'lucide-react'

export default function PushSubscription() {
  const [subscribed, setSubscribed] = useState(isPushSubscribed())
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    try {
      if (subscribed) {
        await unsubscribeFromPushNotifications()
        setSubscribed(false)
        toast('Notifications désactivées', 'info')
      } else {
        const ok = await subscribeToPushNotifications()
        if (ok) {
          setSubscribed(true)
          toast('Notifications activées', 'success')
        } else {
          toast('Impossible d\'activer les notifications', 'warning')
        }
      }
    } catch {
      toast('Erreur', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={subscribed ? 'secondary' : 'primary'} size="sm" onClick={handleToggle} loading={loading}>
      {subscribed ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {subscribed ? 'Désactiver les notifications' : 'Activer les notifications'}
    </Button>
  )
}
