const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SENHA QUE VOCÊ VAI USAR NO PAINEL
const SENHA_GERENTE = "admin123"; 

const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// --- ROTAS DO GERENTE (ADMIN) ---

// Essa rota lista os usuários
app.post('/admin/users', async (req, res) => {
    try {
        const { senha } = req.body;
        if (senha !== SENHA_GERENTE) {
            return res.status(401).json({ success: false, message: "Senha Inválida" });
        }
        const users = await User.find({}, 'user saldo fone');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erro interno" });
    }
});

// Essa rota dá o bônus
app.post('/admin/add-bonus', async (req, res) => {
    try {
        const { senha, targetUser, valor } = req.body;
        if (senha !== SENHA_GERENTE) {
            return res.status(401).json({ success: false, message: "Senha Inválida" });
        }
        
        const user = await User.findOneAndUpdate(
            { user: targetUser },
            { $inc: { saldo: parseFloat(valor) } },
            { new: true }
        );

        if (user) res.json({ success: true, novoSaldo: user.saldo });
        else res.json({ success: false, message: "Usuário não encontrado" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erro ao processar bônus" });
    }
});

// --- RESTO DAS ROTAS (LOGIN, SPIN, ETC) ---

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false, message: "Usuário já existe" }); }
});

app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    const conta = await User.findOne({ user, pass });
    if (conta) res.json({ success: true, saldo: conta.saldo });
    else res.json({ success: false, message: "Dados incorretos" });
});

app.post('/api/spin', async (req, res) => {
    const { user, bets } = req.body;
    const userDb = await User.findOne({ user });
    if (!userDb) return res.json({ success: false });
    
    // Sorteio simples (escolhe cor que ninguém apostou)
    let corAlvo = bets.findIndex(b => b === 0);
    if(corAlvo === -1) corAlvo = Math.floor(Math.random() * 10);
    
    const premio = bets[corAlvo] * 5;
    const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
    await User.findOneAndUpdate({ user }, { saldo: novoSaldo });
    res.json({ success: true, corAlvo, novoSaldo, ganhou: premio > 0 });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo });
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`));
