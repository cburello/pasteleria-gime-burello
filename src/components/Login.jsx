import { useState } from 'react'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.jpeg'

function Login({ onLoginExitoso }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Usuario o contraseña incorrectos.')
      setCargando(false)
    } else {
      onLoginExitoso(data.session)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logo} alt="Gime Burello Pastelería" className="login-logo" />
        <h1 className="login-titulo">
          Gime Burello <span>Pastelería</span>
        </h1>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="campo">
            <label>Usuario</label>
            <input
              type="email"
              placeholder="usuario@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="campo">
            <label>Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="mensaje-error">{error}</p>}

          <button type="submit" className="btn-primario btn-login" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
          </form>
      </div>
    </div>
  )
}

export default Login