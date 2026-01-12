const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÕES ---
const SENHA_GERENTE = "admin123"; 
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

// CONEXÃO BANCO
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// --- LÓGICA DO TEMPO GLOBAL (PARA NÃO RESETAR NO F5) ---
let tempoGlobal = 120; 
setInterval(() => {
    if (tempoGlobal > 0) tempoGlobal--;
    else tempoGlobal = 120;
}, 1000);

app.get('/api/tempo', (req, res) => {
    res.json({ tempo: tempoGlobal });
});

// CONFIG MERCADO PAGO
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' 
});
const payment = new Payment(client);

// --- MOTOR DO JOGO (LUCRO TOTAL) ---
app.post('/api/spin', async (req, res) => {
    try {
        const { user, bets } = req.body;
        const userDb = await User.findOne({ user });
        if (!userDb) return res.json({ success: false });

        let menorValor = Math.min(...bets);
        let coresQueLucram = [];
        bets.forEach((valor, i) => {
            if (valor === menorValor) coresQueLucram.push(i);
        });

        const corAlvo = coresQueLucram[Math.floor(Math.random() * coresQueLucram.length)];
        const premio = bets[corAlvo] * 5.0;
        const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
        
        await User.findOneAndUpdate({ user }, { saldo: novoSaldo });
        res.json({ success: true, corAlvo, novoSaldo, ganhou: premio > 0 });
    } catch (e) { res.json({ success: false }); }
});

// --- GERENTE (ADMIN) ---
app.post('/admin/users', async (req, res) => {
    const { senha } = req.body;
    if (String(senha) !== SENHA_GERENTE) return res.status(401).json({ success: false });
    const users = await User.find({}, 'user saldo fone');
    res.json({ success: true, users });
});

app.post('/admin/add-bonus', async (req, res) => {
    const { senha, targetUser, valor } = req.body;
    if (String(senha) !== SENHA_GERENTE) return res.status(401).json({ success: false });
    const user = await User.findOneAndUpdate({ user: targetUser }, { $inc: { saldo: parseFloat(valor) } }, { new: true });
    if (user) res.json({ success: true, novoSaldo: user.saldo });
    else res.json({ success: false });
});

// --- PIX ---
app.post('/gerar-pix', async (req, res) => {
    try {
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(req.body.valor),
            description: 'Deposito SlotReal',
            payment_method_id: 'pix',
            external_reference: req.body.userLogado,
            payer: { email: 'contato@slot.com' }
        }});
        res.json({ 
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code, 
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64 
        });
    } catch (e) { res.status(500).json(e); }
});

// --- AUTH E SALDO ---
app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false }); }
});

app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    const conta = await User.findOne({ user, pass });
    if (conta) res.json({ success: true, saldo: conta.saldo });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo });
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 TUDO PRONTO`));
