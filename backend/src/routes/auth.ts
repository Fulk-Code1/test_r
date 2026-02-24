import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { signToken, verifyToken } from '../lib/jwt'

const router = Router()

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' })
    }
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(400).json({ error: 'Email already in use' })
    
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { email, password: hashed, name }
    })
    const token = signToken({ userId: user.id, email: user.email })
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    
    const token = signToken({ userId: user.id, email: user.email })
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/me', async (req: Request, res: Response) => {
  try {
    const auth = req.headers.authorization
    if (!auth) return res.status(401).json({ error: 'No token' })
    const payload = verifyToken(auth.replace('Bearer ', '')) as any
    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) return res.status(401).json({ error: 'User not found' })
    res.json({ id: user.id, email: user.email, name: user.name })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router