const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÕES CRÍTICAS ---
const SENHA_GERENTE = "admin123"; 
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

// CONEXÃO BANCO
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ BANCO CONECTADO"))
    .catch(err => console.error("❌ ERRO BANCO:", err));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// CONFIG MERCADO PAGO
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' 
});
const payment = new Payment(client);

// --- ROTAS DO GERENTE (ADMIN) ---

app.post('/admin/users', async (req, res) => {
    const { senha } = req.body;
    if (String(senha) !== SENHA_GERENTE) {
        return res.status(401).json({ success: false, message: "Senha Incorreta" });
    }
    try {
        const users = await User.find({}, 'user saldo fone');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/admin/add-bonus', async (req, res) => {
    const { senha, targetUser, valor } = req.body;
    if (String(senha) !== SENHA_GERENTE) {
        return res.status(401).json({ success: false, message: "Senha Incorreta" });
    }
    try {
        const user = await User.findOneAndUpdate(
            { user: targetUser }, 
            { $inc: { saldo: parseFloat(valor) } }, 
            { new: true }
        );
        if (user) res.json({ success: true, novoSaldo: user.saldo });
        else res.json({ success: false, message: "Usuário não encontrado" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- ROTA PIX ---

app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, userLogado } = req.body;
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(valor),
            description: 'Deposito SlotReal',
            payment_method_id: 'pix',
            external_reference: userLogado,
            payer: { email: 'pix@slotreal.com' }
        }});
        res.json({ 
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code, 
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- JOGO E USUÁRIO ---

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false, message: "Erro ou Usuário já existe" }); }
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
    if (!userDb || userDb.saldo < 0) return res.json({ success: false });
    
    // Escolhe a cor com aposta zero ou aleatória
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

// INICIAR
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR ONLINE`));
